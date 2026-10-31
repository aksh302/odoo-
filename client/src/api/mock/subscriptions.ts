import dayjs from 'dayjs'
import { addPeriods } from '../../lib/cycle'
import type {
  InvoiceSummary,
  Plan,
  QuotationTemplate,
  Subscription,
  SubscriptionLine,
  SubscriptionStatus,
  TemplateLine,
  User,
} from '../../lib/types'
import { customers, users } from './auth'
import { getVariants, plans, products, taxes } from './catalog'
import { applyPayment, buildInvoice, invoices, isOverdue, renumberSeeded } from './ledger'
import { contains, fail, nextId, paginate, requireRole, todayISO } from './util'
import type { MockCtx, MockResult, MockRoutes } from './util'

// Rules follow SRS 9.5 (state machine guards) and 9.4 (line snapshots).

const today = () => dayjs().startOf('day')
const iso = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD')

// ---------- helpers ----------

export function snapshotLine(productId: number, variantId: number | null | undefined, quantity: number): SubscriptionLine | null {
  const p = products.find((x) => x.id === productId)
  if (!p) return null
  const v = variantId ? getVariants().find((x) => x.id === variantId && x.productId === productId) : undefined
  const unitPrice = p.salesPrice + (v?.extraPrice ?? 0)
  return {
    id: nextId(),
    productId,
    variantId: v?.id ?? null,
    description: v ? `${p.name} (${v.attribute}: ${v.value})` : p.name,
    quantity,
    unitPrice,
    taxId: p.taxId ?? null,
    tax: taxes.find((t) => t.id === p.taxId) ?? null,
    amount: quantity * unitPrice,
  }
}

export const findCustomer = (id: number): User | undefined =>
  customers.find((c) => c.id === id) ?? users.find((u) => u.id === id && u.role === 'CUSTOMER')

export const planAvailable = (p: Plan, on = todayISO()) => !p.isArchived && p.startDate <= on && on <= p.endDate

export const snapshotOf = (c: User) => ({
  name: c.name,
  email: c.email,
  company: c.profile?.company ?? null,
  billingAddress: c.profile?.billingAddress ?? null,
  taxId: c.profile?.taxId ?? null,
})

function invoiceSummaries(subscriptionId: number): InvoiceSummary[] {
  return invoices
    .filter((i) => i.subscriptionId === subscriptionId)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
    .map((i) => ({
      id: i.id,
      number: i.number,
      periodStart: i.periodStart,
      periodEnd: i.periodEnd,
      dueDate: i.dueDate,
      total: i.total,
      amountPaid: i.amountPaid,
      status: i.status,
      overdue: isOverdue(i),
    }))
}

// ---------- templates ----------

const templates: QuotationTemplate[] = [
  { id: 1, name: 'ERP starter offer', planId: 1, validityDays: 15, lines: [{ productId: 1, variantId: 1, quantity: 1 }, { productId: 3, variantId: null, quantity: 1 }] },
  { id: 2, name: 'Enterprise yearly bundle', planId: 2, validityDays: 30, lines: [{ productId: 1, variantId: 1, quantity: 10 }, { productId: 2, variantId: 3, quantity: 10 }, { productId: 4, variantId: null, quantity: 5 }] },
  { id: 3, name: 'CRM trial', planId: 3, validityDays: 7, lines: [{ productId: 2, variantId: null, quantity: 1 }] },
]

function templateView(t: QuotationTemplate): QuotationTemplate {
  const plan = plans.find((p) => p.id === t.planId)
  return {
    ...t,
    plan: plan && { id: plan.id, name: plan.name, price: plan.price, billingPeriod: plan.billingPeriod, minQty: plan.minQty },
    lines: t.lines.map((l): TemplateLine => {
      const p = products.find((x) => x.id === l.productId)
      const v = l.variantId ? getVariants().find((x) => x.id === l.variantId) : null
      return { ...l, product: p && { id: p.id, name: p.name, salesPrice: p.salesPrice }, variant: v && { id: v.id, value: v.value, extraPrice: v.extraPrice } }
    }),
  }
}

function validateTemplate(b: any): MockResult | null {
  const fields: Record<string, string> = {}
  if (!String(b.name ?? '').trim()) fields.name = 'Enter a name'
  if (!plans.some((p) => p.id === b.planId)) fields.planId = 'Choose a plan'
  if (!(b.validityDays >= 1)) fields.validityDays = 'At least 1 day'
  if (!Array.isArray(b.lines) || b.lines.length === 0) fields.lines = 'Add at least one product'
  return Object.keys(fields).length ? fail(400, 'VALIDATION_ERROR', 'Invalid template', fields) : null
}

// ---------- subscriptions seed ----------

export interface SubRecord extends Subscription {
  lines: SubscriptionLine[]
}
export const subs: SubRecord[] = []
let subSeq = 0
export const nextSubNumber = () => `SUB-${dayjs().year()}-${String(++subSeq).padStart(6, '0')}`

function makeSub(i: number, status: SubscriptionStatus, planId: number, customer: User, startOffset: number, lineSpec: [number, number | null, number][]): SubRecord {
  const plan = plans.find((p) => p.id === planId)!
  const start = today().add(startOffset, 'day')
  const quotationDate = start.subtract(10, 'day')
  const s: SubRecord = {
    id: i,
    number: `SUB-${start.year()}-${String(++subSeq).padStart(6, '0')}`,
    customerId: customer.id,
    planId,
    status,
    quotationDate: status === 'DRAFT' ? null : iso(quotationDate),
    validUntil: status === 'DRAFT' ? null : iso(quotationDate.add(15, 'day')),
    startDate: iso(start),
    expiryDate: iso(start.add(1, 'year')),
    paymentTerms: 15,
    anchorDay: null,
    nextBillingDate: null,
    createdAt: quotationDate.toISOString(),
    lines: lineSpec.map(([p, v, q]) => snapshotLine(p, v, q)!).filter(Boolean),
  }
  if (status === 'ACTIVE' || status === 'PAUSED' || status === 'CLOSED') {
    s.anchorDay = start.date()
    let next = s.startDate
    const periods: string[] = []
    while (next <= todayISO()) {
      periods.push(next)
      next = addPeriods(s.startDate, plan.billingPeriod, periods.length, s.anchorDay)
    }
    s.nextBillingDate = status === 'CLOSED' ? null : next
    // Seed past invoices (latest 12 periods) into the ledger.
    const customer = findCustomer(s.customerId)!
    periods.slice(-12).forEach((ps, k, arr) => {
      const inv = buildInvoice({
        subscriptionId: s.id,
        subscriptionNumber: s.number,
        customerId: s.customerId,
        customer: snapshotOf(customer),
        plan,
        lines: s.lines,
        periodStart: ps,
        anchorDay: s.anchorDay,
        paymentTerms: s.paymentTerms,
        claimDiscounts: false,
      })
      const latest = k === arr.length - 1
      // Latest invoice is unpaid for 2 of every 3 subscriptions; one gets a part payment.
      if (!latest || i % 3 === 0) {
        applyPayment(inv, { method: (['UPI', 'BANK_TRANSFER', 'CARD'] as const)[k % 3], amount: inv.total, date: iso(dayjs(ps).add(5, 'day')), reference: `TXN${100000 + inv.id}`, note: null })
      } else if (i % 5 === 1) {
        applyPayment(inv, { method: 'UPI', amount: Math.floor(inv.total / 2), date: iso(dayjs(ps).add(3, 'day')), reference: null, note: 'Part payment' })
      }
      inv.emailedAt = inv.createdAt
      invoices.push(inv)
    })
  }
  return s
}

;(() => {
  const cara = users.find((u) => u.id === 3)!
  const pool = [cara, ...customers]
  const spec: [SubscriptionStatus, number, number][] = [
    // status, planId, start offset (days from today)
    ['ACTIVE', 1, -95], ['ACTIVE', 1, -40], ['ACTIVE', 2, -200], ['ACTIVE', 3, -20], ['ACTIVE', 1, -27],
    ['ACTIVE', 1, -310], ['ACTIVE', 2, -30], ['ACTIVE', 3, -9], ['ACTIVE', 1, -61], ['ACTIVE', 1, -3],
    ['PAUSED', 1, -70], ['PAUSED', 3, -15],
    ['CONFIRMED', 1, 6], ['CONFIRMED', 2, 0],
    ['QUOTATION', 1, 10], ['QUOTATION', 2, 20], ['QUOTATION', 3, -25],
    ['DRAFT', 1, 14], ['DRAFT', 2, 30], ['DRAFT', 1, 7],
    ['CLOSED', 3, -160], ['CLOSED', 1, -400],
    ['CANCELLED', 1, -50], ['CANCELLED', 2, -12],
  ]
  const lineSets: [number, number | null, number][][] = [
    [[1, 1, 1], [3, null, 1]],
    [[2, null, 3]],
    [[1, 1, 10], [2, 3, 10], [4, null, 5]],
    [[2, null, 1]],
    [[1, 2, 2], [4, null, 1]],
    [[3, null, 4]],
  ]
  spec.forEach(([status, planId, offset], i) => {
    // Yearly plan gets the big bundle; weekly trials stay small.
    const lines = planId === 2 ? lineSets[2] : planId === 3 ? lineSets[3] : lineSets[i % lineSets.length]
    // Cara (customer@brightloop.test) also owns a paused sub and a quotation, for the portal demo.
    const owner = i === 10 || i === 14 ? cara : pool[i % pool.length]
    subs.push(makeSub(i + 1, status, planId, owner, offset, lines))
  })
  subs.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')) // newest first
  renumberSeeded()
})()

export function view(s: SubRecord): Subscription {
  const c = findCustomer(s.customerId)
  const plan = plans.find((p) => p.id === s.planId)
  const { lines, ...rest } = s
  return {
    ...rest,
    customer: c && { id: c.id, name: c.name, email: c.email, company: c.profile?.company ?? null },
    plan,
    recurringAmount: (plan?.price ?? 0) + lines.reduce((a, l) => a + l.amount, 0),
  }
}

// ---------- validation shared by create and update ----------

function buildLines(body: any, plan: Plan): { lines?: SubscriptionLine[]; error?: MockResult } {
  const raw: { productId: number; variantId?: number | null; quantity: number }[] = body.lines ?? []
  const fields: Record<string, string> = {}
  const lines: SubscriptionLine[] = []
  raw.forEach((l, i) => {
    if (!l.quantity || l.quantity < plan.minQty) fields[`lines.${i}.quantity`] = `At least ${plan.minQty} for this plan`
    const product = products.find((p) => p.id === l.productId)
    if (!product || product.isArchived) fields[`lines.${i}.productId`] = 'Product not available'
    const line = snapshotLine(l.productId, l.variantId, l.quantity)
    if (line) lines.push(line)
  })
  if (Object.keys(fields).length) {
    const qty = Object.keys(fields).some((k) => k.endsWith('quantity'))
    return { error: fail(400, qty ? 'QTY_BELOW_MIN' : 'VALIDATION_ERROR', 'Check the product lines', fields) }
  }
  return { lines }
}

function validateHeader(b: any): { plan?: Plan; error?: MockResult } {
  const fields: Record<string, string> = {}
  if (!findCustomer(b.customerId)) fields.customerId = 'Choose a customer'
  const plan = plans.find((p) => p.id === b.planId)
  if (!plan) fields.planId = 'Choose a plan'
  if (!b.startDate) fields.startDate = 'Choose a start date'
  if (!b.expiryDate) fields.expiryDate = 'Choose an expiry date'
  if (b.startDate && b.expiryDate && b.expiryDate <= b.startDate) fields.expiryDate = 'Expiry must be after the start date'
  if (b.paymentTerms != null && !(Number.isInteger(b.paymentTerms) && b.paymentTerms >= 0)) fields.paymentTerms = 'Whole days, 0 or more'
  if (Object.keys(fields).length) return { error: fail(400, 'VALIDATION_ERROR', 'Invalid subscription', fields) }
  if (!planAvailable(plan!)) return { error: fail(409, 'PLAN_NOT_AVAILABLE', 'Plan not available', { planId: 'This plan is not available today' }) }
  return { plan }
}

// ---------- status machine (SRS 9.5) ----------

export function transition(s: SubRecord, body: any, ctx: MockCtx): MockResult {
  const plan = plans.find((p) => p.id === s.planId)!
  const t = todayISO()
  const bad = (msg: string) => fail(409, 'INVALID_TRANSITION', msg)

  if (body.action === 'renew') {
    if (s.status !== 'ACTIVE') return bad('Only active subscriptions can be renewed')
    if (!plan.renewable) return fail(409, 'PLAN_FLAG_DISABLED', 'Plan does not allow renewal')
    const term = plan.billingPeriod === 'YEARLY' ? 1 : 12 // one plan term: a year of periods
    const newExpiry = plan.billingPeriod === 'YEARLY' ? addPeriods(s.expiryDate, 'YEARLY', term) : iso(dayjs(s.expiryDate).add(1, 'year'))
    if (plan.autoClose && newExpiry > plan.endDate) return fail(409, 'PLAN_FLAG_DISABLED', 'Renewal would go past the plan end date')
    s.expiryDate = newExpiry
    return [200, { subscription: view(s) }]
  }

  const to: SubscriptionStatus = body.status
  const allowed: Record<SubscriptionStatus, SubscriptionStatus[]> = {
    DRAFT: ['QUOTATION', 'CANCELLED'],
    QUOTATION: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['ACTIVE', 'CANCELLED'],
    ACTIVE: ['PAUSED', 'CLOSED'],
    PAUSED: ['ACTIVE', 'CLOSED'],
    CLOSED: [],
    CANCELLED: [],
  }
  if (!allowed[s.status].includes(to)) return bad(`Cannot move from ${s.status} to ${to}`)

  if (to === 'QUOTATION') {
    if (!s.lines.length) return bad('Add at least one line first')
    const validity = templates.find((x) => x.planId === s.planId)?.validityDays ?? 15
    s.quotationDate = t
    s.validUntil = iso(dayjs().add(validity, 'day'))
  }
  if (to === 'CONFIRMED') {
    if (s.validUntil && t > s.validUntil) return fail(409, 'QUOTATION_EXPIRED', 'Quotation expired')
    if (!planAvailable(plan)) return fail(409, 'PLAN_NOT_AVAILABLE', 'Plan not available today')
    if (s.lines.some((l) => l.quantity < plan.minQty)) return fail(400, 'QTY_BELOW_MIN', 'Quantity below plan minimum')
  }
  if (to === 'ACTIVE' && s.status === 'CONFIRMED') {
    if (t < s.startDate) return bad('Cannot activate before the start date')
    s.anchorDay = dayjs(s.startDate).date()
    s.nextBillingDate = s.startDate
  }
  if (to === 'ACTIVE' && s.status === 'PAUSED') {
    s.nextBillingDate = s.nextBillingDate && s.nextBillingDate > t ? s.nextBillingDate : t
  }
  if (to === 'PAUSED' && !plan.pausable) return fail(409, 'PLAN_FLAG_DISABLED', 'Plan does not allow pausing')
  if (to === 'CLOSED') {
    if (!plan.closable) return fail(409, 'PLAN_FLAG_DISABLED', 'Plan does not allow closing early')
    s.nextBillingDate = null
  }
  void ctx
  s.status = to
  return [200, { subscription: view(s) }]
}

// ---------- routes ----------

const backOffice = (ctx: MockCtx) => requireRole(ctx, 'ADMIN', 'STAFF')

export const subscriptionRoutes: MockRoutes = {
  'GET /templates': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const all = templates.filter((t) => contains(t.name, ctx.query.q ?? '')).map(templateView)
    return paginate(all, ctx.query)
  },
  'POST /templates': (ctx) => {
    const denied = backOffice(ctx) ?? validateTemplate(ctx.body)
    if (denied) return denied
    const t: QuotationTemplate = { id: nextId(), name: ctx.body.name.trim(), planId: ctx.body.planId, validityDays: ctx.body.validityDays, lines: ctx.body.lines }
    templates.unshift(t)
    return [201, { template: templateView(t) }]
  },
  // Not in SRS 9.6 yet — ask Akshaya to add PUT /templates/:id (same body as POST).
  'PUT /templates/:id': (ctx) => {
    const denied = backOffice(ctx) ?? validateTemplate(ctx.body)
    if (denied) return denied
    const t = templates.find((x) => x.id === Number(ctx.params.id))
    if (!t) return fail(404, 'NOT_FOUND', 'Template not found')
    Object.assign(t, { name: ctx.body.name.trim(), planId: ctx.body.planId, validityDays: ctx.body.validityDays, lines: ctx.body.lines })
    return [200, { template: templateView(t) }]
  },

  'GET /subscriptions': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const { status, customerId, planId, q = '' } = ctx.query
    const all = subs
      .filter((s) => (status ? s.status === status : true))
      .filter((s) => (customerId ? s.customerId === Number(customerId) : true))
      .filter((s) => (planId ? s.planId === Number(planId) : true))
      .map(view)
      .filter((s) => contains(s.number, q) || contains(s.customer?.name, q) || contains(s.customer?.company, q))
    return paginate(all, ctx.query)
  },

  'GET /subscriptions/:id': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const s = subs.find((x) => x.id === Number(ctx.params.id))
    if (!s) return fail(404, 'NOT_FOUND', 'Subscription not found')
    return [200, { subscription: view(s), lines: s.lines, invoices: invoiceSummaries(s.id) }]
  },

  'POST /subscriptions': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const body = { ...ctx.body }
    const tpl = body.templateId ? templates.find((t) => t.id === body.templateId) : undefined
    if (tpl) {
      body.planId ??= tpl.planId
      if (!body.lines?.length) body.lines = tpl.lines
    }
    const head = validateHeader(body)
    if (head.error) return head.error
    const built = buildLines(body, head.plan!)
    if (built.error) return built.error
    const s: SubRecord = {
      id: nextId(),
      number: nextSubNumber(),
      customerId: body.customerId,
      planId: body.planId,
      status: 'DRAFT',
      quotationDate: null,
      validUntil: null,
      startDate: body.startDate,
      expiryDate: body.expiryDate,
      paymentTerms: body.paymentTerms ?? 15,
      anchorDay: null,
      nextBillingDate: null,
      createdAt: new Date().toISOString(),
      lines: built.lines!,
    }
    subs.unshift(s)
    return [201, { subscription: view(s) }]
  },

  'PUT /subscriptions/:id': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const s = subs.find((x) => x.id === Number(ctx.params.id))
    if (!s) return fail(404, 'NOT_FOUND', 'Subscription not found')
    if (s.status !== 'DRAFT' && s.status !== 'QUOTATION') return fail(409, 'INVALID_TRANSITION', 'Only drafts and quotations can be edited')
    const body = { ...s, ...ctx.body }
    const head = validateHeader(body)
    if (head.error) return head.error
    const built = buildLines(body, head.plan!)
    if (built.error) return built.error
    Object.assign(s, {
      customerId: body.customerId,
      planId: body.planId,
      startDate: body.startDate,
      expiryDate: body.expiryDate,
      paymentTerms: body.paymentTerms,
      lines: built.lines,
    })
    return [200, { subscription: view(s) }]
  },

  'PATCH /subscriptions/:id/status': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const s = subs.find((x) => x.id === Number(ctx.params.id))
    if (!s) return fail(404, 'NOT_FOUND', 'Subscription not found')
    return transition(s, ctx.body, ctx)
  },
}
