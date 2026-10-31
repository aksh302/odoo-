import dayjs from 'dayjs'
import type { Tax, User } from '../../lib/types'
import { customers, users } from './auth'
import { taxes } from './catalog'
import { discounts, invoices, isOverdue } from './ledger'
import type { MockDiscount } from './ledger'
import { subs, view } from './subscriptions'
import { audit, auditLog, contains, fail, nextId, paginate, requireRole } from './util'
import type { MockCtx, MockResult, MockRoutes } from './util'

// Taxes, discounts, staff, customers and the audit log (SRS 2.1, FR-1.10 to 1.12, FR-5, NFR-12).

const adminOnly = (ctx: MockCtx) => requireRole(ctx, 'ADMIN')
const backOffice = (ctx: MockCtx) => requireRole(ctx, 'ADMIN', 'STAFF')
const allPeople = () => [...users, ...customers]
const emailTaken = (email: string, exceptId?: number) =>
  allPeople().some((u) => u.email.toLowerCase() === email.toLowerCase() && u.id !== exceptId)

// ---------- validation ----------

function validateTax(b: any): MockResult | null {
  const fields: Record<string, string> = {}
  if (!String(b.name ?? '').trim()) fields.name = 'Enter a name'
  if (!(typeof b.percent === 'number' && b.percent >= 0 && b.percent <= 100)) fields.percent = 'Between 0 and 100'
  return Object.keys(fields).length ? fail(400, 'VALIDATION_ERROR', 'Invalid tax', fields) : null
}

function validateDiscount(b: Partial<MockDiscount>): MockResult | null {
  const fields: Record<string, string> = {}
  if (!String(b.name ?? '').trim()) fields.name = 'Enter a name'
  if (b.type === 'PERCENT' && !(Number.isInteger(b.value) && b.value! > 0 && b.value! <= 100)) fields.value = 'A whole percent from 1 to 100'
  if (b.type === 'FIXED' && !(Number.isInteger(b.value) && b.value! > 0)) fields.value = 'Enter an amount above 0'
  if (b.scope === 'PRODUCT' && !b.productIds?.length) fields.productIds = 'Choose at least one product'
  if (b.startDate && b.endDate && b.endDate < b.startDate) fields.endDate = 'Must be on or after the start date'
  if (b.usageLimit != null && !(Number.isInteger(b.usageLimit) && b.usageLimit >= 1)) fields.usageLimit = 'At least 1, or leave empty for no limit'
  return Object.keys(fields).length ? fail(400, 'VALIDATION_ERROR', 'Invalid discount', fields) : null
}

function validatePerson(b: any, exceptId?: number): MockResult | null {
  const fields: Record<string, string> = {}
  if (b.name !== undefined && !String(b.name).trim()) fields.name = 'Enter a name'
  if (b.email !== undefined) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.email))) fields.email = 'Enter a valid email'
    else if (emailTaken(b.email, exceptId)) return fail(409, 'EMAIL_TAKEN', 'Email already registered', { email: 'This email is already registered' })
  }
  return Object.keys(fields).length ? fail(400, 'VALIDATION_ERROR', 'Invalid details', fields) : null
}

const discountView = (d: MockDiscount) => ({ ...d, productIds: [...d.productIds] })

// ---------- routes ----------

export const adminRoutes: MockRoutes = {
  // Taxes
  'POST /taxes': (ctx) => {
    const denied = adminOnly(ctx) ?? validateTax(ctx.body)
    if (denied) return denied
    const t: Tax = { id: nextId(), name: ctx.body.name.trim(), percent: ctx.body.percent }
    taxes.push(t)
    audit(ctx, 'TAX_CREATE', 'Tax', t.id, t.name, null, t)
    return [201, { tax: t }]
  },
  // Not in SRS 9.6 yet: edit a tax rule. Existing invoices keep their snapshot (FR-5.8).
  'PUT /taxes/:id': (ctx) => {
    const t = taxes.find((x) => x.id === Number(ctx.params.id))
    if (!t) return fail(404, 'NOT_FOUND', 'Tax not found')
    const denied = adminOnly(ctx) ?? validateTax({ ...t, ...ctx.body })
    if (denied) return denied
    audit(ctx, 'TAX_UPDATE', 'Tax', t.id, t.name, { ...t }, { ...t, ...ctx.body })
    Object.assign(t, { name: (ctx.body.name ?? t.name).trim(), percent: ctx.body.percent ?? t.percent })
    return [200, { tax: t }]
  },

  // Discounts
  'GET /discounts': (ctx) => adminOnly(ctx) ?? paginate(discounts.filter((d) => contains(d.name, ctx.query.q ?? '')).map(discountView), ctx.query),
  'POST /discounts': (ctx) => {
    const b = { ...ctx.body }
    const denied = adminOnly(ctx) ?? validateDiscount(b)
    if (denied) return denied
    const d: MockDiscount = {
      id: nextId(),
      name: b.name.trim(),
      type: b.type,
      value: b.value,
      scope: b.scope,
      productIds: b.scope === 'PRODUCT' ? b.productIds : [],
      minQty: b.minQty ?? undefined,
      minPurchase: b.minPurchase ?? undefined,
      startDate: b.startDate,
      endDate: b.endDate,
      usageLimit: b.usageLimit ?? undefined,
      usedCount: 0,
      isActive: true,
    }
    discounts.unshift(d)
    audit(ctx, 'DISCOUNT_CREATE', 'Discount', d.id, d.name, null, discountView(d))
    return [201, { discount: discountView(d) }]
  },
  'PUT /discounts/:id': (ctx) => {
    const d = discounts.find((x) => x.id === Number(ctx.params.id))
    if (!d) return fail(404, 'NOT_FOUND', 'Discount not found')
    const { usedCount: _readOnly, ...changes } = ctx.body
    const merged = { ...d, ...changes }
    const denied = adminOnly(ctx) ?? validateDiscount(merged)
    if (denied) return denied
    audit(ctx, changes.isActive === false ? 'DISCOUNT_DEACTIVATE' : 'DISCOUNT_UPDATE', 'Discount', d.id, d.name, discountView(d), discountView(merged))
    Object.assign(d, changes, { productIds: merged.scope === 'PRODUCT' ? merged.productIds : [] })
    return [200, { discount: discountView(d) }]
  },

  // Staff
  // Not in SRS 9.6 yet: list staff and admins for the Staff screen.
  'GET /users': (ctx) => {
    const denied = adminOnly(ctx)
    if (denied) return denied
    const all = users.filter((u) => u.role !== 'CUSTOMER' && contains(`${u.name} ${u.email}`, ctx.query.q ?? ''))
    return paginate(all, ctx.query)
  },
  'POST /users/staff': (ctx) => {
    const denied = adminOnly(ctx) ?? validatePerson(ctx.body)
    if (denied) return denied
    const pw = String(ctx.body.password ?? '')
    if (pw.length < 9 || !/[A-Z]/.test(pw) || !/[a-z]/.test(pw) || !/[^A-Za-z0-9]/.test(pw))
      return fail(400, 'VALIDATION_ERROR', 'Weak password', { password: 'Needs 9+ characters, upper and lower case, and a special character' })
    const u: User = { id: nextId(), name: ctx.body.name.trim(), email: ctx.body.email.trim().toLowerCase(), role: 'STAFF', isActive: true }
    users.push(u)
    audit(ctx, 'STAFF_CREATE', 'User', u.id, u.email, null, { name: u.name, role: 'STAFF' })
    return [201, { user: u }]
  },
  'PATCH /users/:id/active': (ctx) => {
    const denied = adminOnly(ctx)
    if (denied) return denied
    const u = users.find((x) => x.id === Number(ctx.params.id))
    if (!u) return fail(404, 'NOT_FOUND', 'User not found')
    const next = !!ctx.body.isActive
    if (!next && u.role === 'ADMIN' && users.filter((x) => x.role === 'ADMIN' && x.isActive).length <= 1)
      return fail(409, 'INVALID_TRANSITION', 'The last active admin cannot be deactivated')
    if (!next && u.id === ctx.me?.id) return fail(409, 'INVALID_TRANSITION', 'You cannot deactivate yourself')
    audit(ctx, next ? 'USER_REACTIVATE' : 'USER_DEACTIVATE', 'User', u.id, u.email, { isActive: u.isActive }, { isActive: next })
    u.isActive = next
    return [200, { user: u }]
  },

  // Customers (list lives in auth.ts)
  'GET /customers/:id': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const c = allPeople().find((u) => u.id === Number(ctx.params.id) && u.role === 'CUSTOMER')
    if (!c) return fail(404, 'NOT_FOUND', 'Customer not found')
    const theirSubs = subs.filter((s) => s.customerId === c.id).map(view)
    const theirInvoices = invoices
      .filter((i) => i.customerId === c.id)
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
      .map(({ lines: _l, payments: _p, ...i }) => ({ ...i, overdue: isOverdue(i as never) }))
    return [200, { customer: c, subscriptions: theirSubs, invoices: theirInvoices }]
  },
  'POST /customers': (ctx) => {
    const b = ctx.body
    const denied = backOffice(ctx) ?? validatePerson({ name: b.name ?? '', email: b.email ?? '' })
    if (denied) return denied
    const c: User = {
      id: nextId(),
      name: b.name.trim(),
      email: b.email.trim().toLowerCase(),
      role: 'CUSTOMER',
      isActive: true,
      profile: { company: b.company || null, phone: b.phone || null, billingAddress: b.billingAddress || null, taxId: b.taxId || null },
    }
    customers.unshift(c)
    audit(ctx, 'CUSTOMER_CREATE', 'User', c.id, c.email, null, { name: c.name, company: c.profile?.company })
    // Real API: sends a set-password email (FR-1.11).
    return [201, { customer: c }]
  },
  'PUT /customers/:id': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const c = allPeople().find((u) => u.id === Number(ctx.params.id) && u.role === 'CUSTOMER')
    if (!c) return fail(404, 'NOT_FOUND', 'Customer not found')
    const invalid = validatePerson(ctx.body, c.id)
    if (invalid) return invalid
    const before = { name: c.name, email: c.email, ...c.profile }
    const b = ctx.body
    if (b.name !== undefined) c.name = b.name.trim()
    if (b.email !== undefined) c.email = b.email.trim().toLowerCase()
    c.profile = {
      company: b.company !== undefined ? b.company || null : c.profile?.company,
      phone: b.phone !== undefined ? b.phone || null : c.profile?.phone,
      billingAddress: b.billingAddress !== undefined ? b.billingAddress || null : c.profile?.billingAddress,
      taxId: b.taxId !== undefined ? b.taxId || null : c.profile?.taxId,
    }
    audit(ctx, 'CUSTOMER_UPDATE', 'User', c.id, c.email, before, { name: c.name, email: c.email, ...c.profile })
    return [200, { customer: c }]
  },

  // Audit log
  'GET /audit': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const { entity, entityId, q = '' } = ctx.query
    const all = auditLog
      .filter((a) => (entity ? a.entity === entity : true))
      .filter((a) => (entityId ? a.entityId === Number(entityId) : true))
      .filter((a) => contains(`${a.action} ${a.entityLabel} ${a.userName}`, q))
    return paginate(all, ctx.query)
  },
}

// A little history so the audit log isn't empty on first open.
;(() => {
  const admin = { me: users.find((u) => u.role === 'ADMIN') }
  const staff = { me: users.find((u) => u.role === 'STAFF') }
  const seed: [typeof admin, string, string, number, string, unknown, unknown, number][] = [
    [admin, 'DISCOUNT_CREATE', 'Discount', 2, 'Festive ₹500 off', null, { type: 'FIXED', value: 50000 }, 30],
    [staff, 'CUSTOMER_CREATE', 'User', 104, 'customer5@example.com', null, { name: 'Customer 5' }, 21],
    [admin, 'TAX_CREATE', 'Tax', 3, 'GST 5%', null, { percent: 5 }, 14],
    [admin, 'STAFF_CREATE', 'User', 2, 'staff@brightloop.test', null, { role: 'STAFF' }, 60],
  ]
  seed.forEach(([who, action, entity, id, label, oldV, newV, daysAgo]) => {
    audit(who, action, entity, id, label, oldV, newV)
    auditLog[0].at = dayjs().subtract(daysAgo, 'day').hour(9 + (daysAgo % 8)).minute((daysAgo * 7) % 60).toISOString()
  })
  auditLog.sort((a, b) => b.at.localeCompare(a.at))
})()
