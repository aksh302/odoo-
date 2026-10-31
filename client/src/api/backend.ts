import { AxiosError, AxiosHeaders } from 'axios'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'

/**
 * Translates the frontend's SRS 9.6 calls into the backend's actual routes and shapes
 * (Akshaya's `server/`), so neither side has to rename anything.
 *
 * - paths and verbs:  /products -> /catalog/products, PATCH /subscriptions/1/status -> POST /subscriptions/1/transition
 * - request bodies:   drops nulls (zod `.optional()` rejects null), renames fields
 * - responses:        midnight-UTC dates -> 'YYYY-MM-DD', Decimal strings -> numbers, renamed keys
 * - not built yet:    a rule returning null answers 501 NOT_BUILT so the screen shows a clear message
 *
 * See BACKEND_GAPS.md for the list of server endpoints still missing.
 */

type Json = any // eslint-disable-line @typescript-eslint/no-explicit-any

interface Call {
  method: string
  url: string
  params?: Record<string, unknown>
  body?: Json
  /** send nulls as-is (for fields an edit form clears on purpose) */
  keepNulls?: boolean
}

interface Rule {
  method: string
  path: RegExp
  /** where to send it; return null when the server has no such endpoint yet */
  to: (m: RegExpMatchArray, c: Call) => Call | null
  /** reshape the server's answer into what the screen expects */
  out?: (data: Json, c: Call) => Json
  /** for answers that need more than one server call */
  compose?: (m: RegExpMatchArray, c: Call, send: (c: Call) => Promise<Json>) => Promise<Json>
}

const same = (_m: RegExpMatchArray, c: Call): Call => c
const at = (url: string, extra: Partial<Call> = {}) => (_m: RegExpMatchArray, c: Call): Call => ({ ...c, url, ...extra })

const paged = (rows: Json[], params: Record<string, unknown> = {}) => {
  const page = Number(params.page ?? 1)
  const limit = Number(params.limit ?? 20)
  return { data: rows.slice((page - 1) * limit, page * limit), page, limit, total: rows.length }
}

const contains = (v: unknown, q: unknown) => !q || String(v ?? '').toLowerCase().includes(String(q).toLowerCase())
const today = () => new Date().toISOString().slice(0, 10)

/** Search/filters the server doesn't support yet are applied here on one big page. */
function filterList(data: Json, c: Call, keep: (row: Json) => boolean) {
  if (!data?.data) return data
  return paged(data.data.filter(keep), c.params)
}
const bigPage = (c: Call): Call => ({ ...c, params: { ...c.params, page: 1, limit: 100 } })

const discountOut = (d: Json) => (d ? { ...d, productIds: d.productIds ?? (d.products ?? []).map((p: Json) => p.productId) } : d)
const withCompany = (s: Json) =>
  s?.customer ? { ...s, customer: { ...s.customer, company: s.customer.company ?? s.customer.profile?.company ?? null } } : s
/** The server stores the snapshot's address as `address`; screens read `billingAddress`. */
const invoiceOut = (i: Json) =>
  i?.customerSnapshot ? { ...i, customerSnapshot: { billingAddress: i.customerSnapshot.address ?? null, ...i.customerSnapshot } } : i
const invoiceListOut = (d: Json) => (d?.data ? { ...d, data: d.data.map(invoiceOut) } : d)
const invoiceDetailOut = (d: Json) => (d?.invoice ? { ...d, invoice: invoiceOut(d.invoice) } : d)
const recurring = (s: Json) =>
  s.recurringAmount ?? (s.plan?.price ?? 0) + (s.lines ?? []).reduce((a: number, l: Json) => a + (l.amount ?? 0), 0)

const RULES: Rule[] = [
  // ---- auth ----
  { method: 'POST', path: /^\/auth\/forgot$/, to: at('/auth/forgot-password') },
  { method: 'POST', path: /^\/auth\/reset$/, to: at('/auth/reset-password') },

  // ---- catalog ----
  {
    method: 'GET',
    path: /^\/products$/,
    to: (_m, c) => bigPage({ ...c, url: '/catalog/products', params: { ...c.params, includeArchived: c.params?.archived ? 'true' : undefined } }),
    out: (d, c) => filterList(d, c, (p) => contains(p.name, c.params?.q) || contains(p.type, c.params?.q)),
  },
  { method: 'POST', path: /^\/products$/, to: at('/catalog/products') },
  {
    method: 'PUT',
    path: /^\/products\/(\d+)$/,
    to: (m, c) =>
      c.body?.isArchived === true
        ? { ...c, method: 'POST', url: `/catalog/products/${m[1]}/archive`, body: {} }
        : c.body?.isArchived === false && Object.keys(c.body).length === 1
          ? { ...c, method: 'POST', url: `/catalog/products/${m[1]}/restore`, body: {} }
          : { ...c, url: `/catalog/products/${m[1]}` },
  },
  { method: 'POST', path: /^\/variants$/, to: at('/catalog/variants') },
  {
    method: 'PUT',
    path: /^\/variants\/(\d+)$/,
    to: (m, c) => (c.body?.isArchived ? { ...c, method: 'POST', url: `/catalog/variants/${m[1]}/archive`, body: {} } : { ...c, url: `/catalog/variants/${m[1]}` }),
  },
  {
    method: 'GET',
    path: /^\/plans$/,
    to: (_m, c) => bigPage({ ...c, url: '/catalog/plans', params: { ...c.params, includeArchived: c.params?.archived ? 'true' : undefined } }),
    out: (d, c) =>
      filterList(d, c, (p) => {
        const t = today()
        if (c.params?.available && !(p.startDate <= t && t <= p.endDate && !p.isArchived)) return false
        if (c.params?.billingPeriod && p.billingPeriod !== c.params.billingPeriod) return false
        return contains(p.name, c.params?.q)
      }),
  },
  { method: 'POST', path: /^\/plans$/, to: at('/catalog/plans') },
  {
    method: 'PUT',
    path: /^\/plans\/(\d+)$/,
    to: (m, c) => {
      const only = c.body && Object.keys(c.body).length === 1
      if (only && c.body.isArchived === true) return { ...c, method: 'POST', url: `/catalog/plans/${m[1]}/archive`, body: {} }
      if (only && c.body.isArchived === false) return { ...c, method: 'POST', url: `/catalog/plans/${m[1]}/restore`, body: {} }
      return { ...c, url: `/catalog/plans/${m[1]}` }
    },
  },
  { method: 'GET', path: /^\/taxes$/, to: at('/catalog/taxes'), out: (d, c) => (Array.isArray(d?.taxes) ? paged(d.taxes, { limit: 100, ...c.params }) : d) },
  { method: 'POST', path: /^\/taxes$/, to: at('/catalog/taxes') },
  { method: 'PUT', path: /^\/taxes\/(\d+)$/, to: (m, c) => ({ ...c, url: `/catalog/taxes/${m[1]}` }) },

  // ---- templates ----
  { method: 'GET', path: /^\/templates$/, to: (_m, c) => bigPage({ ...c, url: '/quotations' }), out: (d, c) => filterList(d, c, (t) => contains(t.name, c.params?.q)) },
  { method: 'POST', path: /^\/templates$/, to: at('/quotations') },
  { method: 'PUT', path: /^\/templates\/(\d+)$/, to: (m, c) => ({ ...c, url: `/quotations/${m[1]}` }) },

  // ---- customers & staff ----
  {
    method: 'GET',
    path: /^\/customers$/,
    to: (_m, c) => bigPage({ ...c, url: '/auth/customers' }),
    out: (d, c) => filterList(d, c, (u) => contains(u.name, c.params?.q) || contains(u.email, c.params?.q) || contains(u.profile?.company, c.params?.q)),
  },
  {
    method: 'GET',
    path: /^\/customers\/(\d+)$/,
    to: (m, c) => ({ ...c, url: `/auth/customers/${m[1]}` }),
    compose: async (m, c, send) => {
      const { customer } = await send({ ...c, url: `/auth/customers/${m[1]}` })
      const subs = await send({ method: 'GET', url: '/subscriptions', params: { customerId: m[1], limit: 100 } })
      const invs = await send({ method: 'GET', url: '/billing/invoices', params: { customerId: m[1], limit: 100 } })
      return {
        customer: { ...customer, role: 'CUSTOMER' },
        subscriptions: (subs.data ?? []).map(withCompany).map((s: Json) => ({ ...s, recurringAmount: recurring(s) })),
        invoices: (invs.data ?? []).map(invoiceOut),
      }
    },
  },
  { method: 'POST', path: /^\/customers$/, to: at('/auth/customers') },
  { method: 'PUT', path: /^\/customers\/(\d+)$/, to: (m, c) => ({ ...c, url: `/auth/customers/${m[1]}` }) },
  { method: 'GET', path: /^\/users$/, to: at('/auth/users') },
  { method: 'POST', path: /^\/users\/staff$/, to: at('/auth/staff'), out: (d) => (d?.staff ? { user: { isActive: true, ...d.staff } } : d) },
  {
    method: 'PATCH',
    path: /^\/users\/(\d+)\/active$/,
    to: (m, c) => ({ ...c, method: 'POST', url: `/auth/users/${m[1]}/${c.body?.isActive === false ? 'deactivate' : 'reactivate'}`, body: {} }),
  },

  // ---- subscriptions ----
  {
    method: 'GET',
    path: /^\/subscriptions$/,
    to: same, // server filters by status, customerId, planId, q, expiringWithin
    out: (d) => (d?.data ? { ...d, data: d.data.map(withCompany).map((s: Json) => ({ ...s, recurringAmount: recurring(s) })) } : d),
  },
  {
    method: 'GET',
    path: /^\/subscriptions\/(\d+)$/,
    to: same,
    out: (d) => {
      const s = d?.subscription
      if (!s || d.lines) return d
      const { lines = [], invoices = [], ...rest } = s
      return { subscription: { ...withCompany(rest), recurringAmount: recurring(s) }, lines, invoices }
    },
  },
  { method: 'PUT', path: /^\/subscriptions\/\d+$/, to: same },
  {
    method: 'PATCH',
    path: /^\/subscriptions\/(\d+)\/status$/,
    to: (m, c) =>
      c.body?.action === 'renew'
        ? { ...c, method: 'POST', url: `/subscriptions/${m[1]}/renew`, body: {} }
        : { ...c, method: 'POST', url: `/subscriptions/${m[1]}/transition`, body: { status: c.body?.status } },
  },

  // ---- billing & invoices ----
  { method: 'GET', path: /^\/billing\/runs$/, to: same },
  { method: 'GET', path: /^\/invoices$/, to: at('/billing/invoices'), out: invoiceListOut },
  { method: 'GET', path: /^\/invoices\/(\d+)$/, to: (m, c) => ({ ...c, url: `/billing/invoices/${m[1]}` }), out: invoiceDetailOut },
  {
    method: 'PATCH',
    path: /^\/invoices\/(\d+)\/status$/,
    to: (m, c) => ({ ...c, method: 'POST', url: `/billing/invoices/${m[1]}/${c.body?.status === 'CANCELLED' ? 'cancel' : 'confirm'}`, body: {} }),
  },
  {
    method: 'POST',
    path: /^\/invoices\/confirm-drafts$/,
    to: (_m, c) => ({ ...c, url: '/billing/invoices/confirm-drafts', body: c.body?.ids?.length ? { invoiceIds: c.body.ids } : {} }),
    out: (d) => ({ confirmed: d?.confirmedCount ?? d?.confirmed ?? 0 }),
  },
  { method: 'POST', path: /^\/invoices\/(\d+)\/remind$/, to: (m, c) => ({ ...c, url: `/billing/invoices/${m[1]}/remind` }), out: invoiceDetailOut },
  { method: 'POST', path: /^\/invoices\/remind-overdue$/, to: at('/billing/invoices/remind-overdue') },
  { method: 'POST', path: /^\/payments$/, to: same, out: invoiceDetailOut },
  { method: 'POST', path: /^\/payments\/\d+\/void$/, to: same, out: invoiceDetailOut },

  // ---- pricing, reports, audit ----
  {
    method: 'GET',
    path: /^\/discounts$/,
    to: (_m, c) => bigPage({ ...c, url: '/pricing/discounts' }),
    out: (d, c) => (d?.data ? paged(d.data.map(discountOut).filter((x: Json) => contains(x.name, c.params?.q)), c.params) : d),
  },
  {
    method: 'POST',
    path: /^\/discounts$/,
    to: (_m, c) => ({ ...c, url: '/pricing/discounts' }),
    out: (d) => (d?.discount ? { discount: discountOut(d.discount) } : d),
  },
  {
    method: 'PUT',
    path: /^\/discounts\/(\d+)$/,
    to: (m, c) => {
      const { usedCount: _readOnly, id: _id, products: _p, ...body } = c.body ?? {}
      return { ...c, url: `/pricing/discounts/${m[1]}`, body, keepNulls: true }
    },
    out: (d) => (d?.discount ? { discount: discountOut(d.discount) } : d),
  },
  {
    method: 'GET',
    path: /^\/reports\/summary$/,
    to: same,
    out: (d) =>
      d && !('overdueCount' in d)
        ? {
            ...d,
            overdueCount: d.overdue?.count ?? 0,
            overdueAmount: d.overdue?.amount ?? 0,
            aging: {
              d0_30: d.aging?.days_0_30 ?? 0,
              d31_60: d.aging?.days_31_60 ?? 0,
              d60plus: (d.aging?.days_61_90 ?? 0) + (d.aging?.days_90_plus ?? 0),
            },
            counts: d.counts ?? { paid: 0, outstanding: 0, overdue: d.overdue?.count ?? 0 },
            revenueByMonth: d.revenueByMonth ?? [],
          }
        : d,
  },
  { method: 'GET', path: /^\/reports\/export\.csv$/, to: at('/reports/csv') },
  { method: 'GET', path: /^\/audit$/, to: at('/reports/audit') },

  // ---- portal ----
  {
    method: 'POST',
    path: /^\/portal\/subscriptions$/,
    to: (_m, c) => ({
      ...c,
      url: '/portal/subscriptions/self-subscribe',
      body: { planId: c.body?.planId, lines: c.body?.lines ?? [], startDate: new Date(Date.now() + 864e5).toISOString().slice(0, 10) },
    }),
  },
  {
    method: 'PATCH',
    path: /^\/portal\/subscriptions\/(\d+)\/status$/,
    to: (m, c) => {
      const action = c.body?.action === 'renew' ? 'renew' : ({ PAUSED: 'pause', ACTIVE: 'resume', CLOSED: 'close' } as Record<string, string>)[c.body?.status]
      return action ? { ...c, method: 'POST', url: `/portal/subscriptions/${m[1]}/${action}`, body: {} } : null
    },
  },
  { method: 'GET', path: /^\/portal\/payments$/, to: same },
  { method: 'GET', path: /^\/portal\/invoices$/, to: same, out: invoiceListOut },
  { method: 'GET', path: /^\/portal\/invoices\/\d+$/, to: same, out: invoiceDetailOut },
]

// ---------------------------------------------------------------------------

/** Removes nulls: the server's zod schemas accept `undefined` but not `null`. */
function dropNulls(v: Json): Json {
  if (Array.isArray(v)) return v.map(dropNulls)
  if (v && typeof v === 'object') {
    const out: Json = {}
    for (const [k, x] of Object.entries(v)) if (x !== null) out[k] = dropNulls(x)
    return out
  }
  return v
}

const MIDNIGHT = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/
const NUMERIC_KEYS = new Set(['percent', 'taxPercent'])

/** Date-only columns come back as midnight UTC timestamps; Prisma Decimals come back as strings. */
function normalize(v: Json, key = ''): Json {
  if (Array.isArray(v)) return v.map((x) => normalize(x))
  if (v && typeof v === 'object') {
    const out: Json = {}
    for (const [k, x] of Object.entries(v)) out[k] = normalize(x, k)
    return out
  }
  if (typeof v === 'string') {
    const m = v.match(MIDNIGHT)
    if (m) return m[1]
    if (NUMERIC_KEYS.has(key) && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  }
  return v
}

const parse = (d: Json) => {
  if (typeof d !== 'string') return d
  try {
    return d ? JSON.parse(d) : d
  } catch {
    return d
  }
}

function fail(config: InternalAxiosRequestConfig, status: number, code: string, message: string): never {
  const response: AxiosResponse = { data: { error: { code, message } }, status, statusText: code, headers: new AxiosHeaders(), config }
  throw new AxiosError(message, String(status), config, undefined, response)
}

/** Wraps the real HTTP adapter with the translation rules above. */
export function translatingAdapter(http: AxiosAdapter): AxiosAdapter {
  const send = async (base: InternalAxiosRequestConfig, c: Call) => {
    const res = await http({
      ...base,
      method: c.method.toLowerCase(),
      url: c.url,
      params: c.params,
      data: c.body === undefined ? undefined : JSON.stringify(c.keepNulls ? c.body : dropNulls(c.body)),
    })
    return res
  }

  return async (config) => {
    const method = (config.method ?? 'get').toUpperCase()
    const path = (config.url ?? '').split('?')[0]
    const call: Call = { method, url: path, params: config.params, body: parse(config.data) }
    const rule = RULES.find((r) => r.method === method && r.path.test(path))
    const m = rule ? path.match(rule.path)! : ([] as unknown as RegExpMatchArray)

    if (rule?.compose) {
      const data = await rule.compose(m, call, async (c) => normalize(parse((await send(config, c)).data)))
      return { data: normalize(data), status: 200, statusText: 'OK', headers: new AxiosHeaders(), config }
    }

    const target = rule ? rule.to(m, call) : call
    if (!target) fail(config, 501, 'NOT_BUILT', 'This part of the server isn’t ready yet.')

    const res = await send(config, target)
    // Files (PDF, CSV as blob) pass straight through.
    if (config.responseType === 'blob' || config.responseType === 'arraybuffer') return res
    let data = normalize(parse(res.data))
    if (rule?.out) data = rule.out(data, call)
    return { ...res, data }
  }
}
