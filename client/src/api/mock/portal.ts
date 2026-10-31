import dayjs from 'dayjs'
import type { Invoice } from '../../lib/types'
import { plans } from './catalog'
import { invoices, isOverdue } from './ledger'
import type { InvoiceRecord } from './ledger'
import { nextSubNumber, planAvailable, snapshotLine, subs, transition, view } from './subscriptions'
import type { SubRecord } from './subscriptions'
import { fail, nextId, paginate, requireRole, todayISO } from './util'
import type { MockCtx, MockRoutes } from './util'

// Customer portal (SRS 9.6 "portal"): everything is filtered by the customer id from the token.
// Other customers' records answer 404, never 403, so their existence isn't revealed.

const customerOnly = (ctx: MockCtx) => requireRole(ctx, 'CUSTOMER')
const mine = (ctx: MockCtx) => subs.filter((s) => s.customerId === ctx.me!.id)
const myInvoices = (ctx: MockCtx) => invoices.filter((i) => i.customerId === ctx.me!.id && i.status !== 'DRAFT')

function invoiceView(i: InvoiceRecord): Invoice {
  const { lines: _l, payments: _p, ...rest } = i
  return { ...rest, overdue: isOverdue(i) }
}

export const portalRoutes: MockRoutes = {
  'GET /portal/subscriptions': (ctx) => {
    const denied = customerOnly(ctx)
    if (denied) return denied
    const order = ['ACTIVE', 'PAUSED', 'QUOTATION', 'CONFIRMED', 'DRAFT', 'CLOSED', 'CANCELLED']
    const all = mine(ctx)
      .map(view)
      .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
    return paginate(all, ctx.query)
  },

  'POST /portal/subscriptions': (ctx) => {
    const denied = customerOnly(ctx)
    if (denied) return denied
    const plan = plans.find((p) => p.id === ctx.body.planId)
    if (!plan || !planAvailable(plan)) return fail(409, 'PLAN_NOT_AVAILABLE', 'Plan not available', { planId: 'This plan is not available' })
    const raw: { productId: number; variantId?: number | null; quantity: number }[] = ctx.body.lines ?? []
    const fields: Record<string, string> = {}
    raw.forEach((l, i) => {
      if (!l.quantity || l.quantity < plan.minQty) fields[`lines.${i}.quantity`] = `At least ${plan.minQty} for this plan`
    })
    if (Object.keys(fields).length) return fail(400, 'QTY_BELOW_MIN', 'Quantity below plan minimum', fields)
    const start = dayjs().add(1, 'day')
    const s: SubRecord = {
      id: nextId(),
      number: nextSubNumber(),
      customerId: ctx.me!.id,
      planId: plan.id,
      // Requests arrive as quotations for staff to review and confirm.
      status: 'QUOTATION',
      quotationDate: todayISO(),
      validUntil: dayjs().add(15, 'day').format('YYYY-MM-DD'),
      startDate: start.format('YYYY-MM-DD'),
      expiryDate: start.add(1, 'year').format('YYYY-MM-DD'),
      paymentTerms: 15,
      anchorDay: null,
      nextBillingDate: null,
      createdAt: new Date().toISOString(),
      lines: raw.map((l) => snapshotLine(l.productId, l.variantId, l.quantity)!).filter(Boolean),
    }
    subs.unshift(s)
    return [201, { subscription: view(s) }]
  },

  'PATCH /portal/subscriptions/:id/status': (ctx) => {
    const denied = customerOnly(ctx)
    if (denied) return denied
    const s = mine(ctx).find((x) => x.id === Number(ctx.params.id))
    if (!s) return fail(404, 'NOT_FOUND', 'Subscription not found')
    // Customers may only pause, resume, renew or close their own subscriptions.
    const b = ctx.body
    const ok = b.action === 'renew' || ['PAUSED', 'ACTIVE', 'CLOSED'].includes(b.status)
    if (!ok || (b.status === 'ACTIVE' && s.status !== 'PAUSED')) return fail(403, 'FORBIDDEN', 'Not allowed from the portal')
    return transition(s, b, ctx)
  },

  'GET /portal/invoices': (ctx) => {
    const denied = customerOnly(ctx)
    if (denied) return denied
    const all = myInvoices(ctx)
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
      .map(invoiceView)
    return paginate(all, ctx.query)
  },

  // Not in SRS 9.6 yet: invoice detail for the portal's printable view.
  'GET /portal/invoices/:id': (ctx) => {
    const denied = customerOnly(ctx)
    if (denied) return denied
    const inv = myInvoices(ctx).find((i) => i.id === Number(ctx.params.id))
    if (!inv) return fail(404, 'NOT_FOUND', 'Invoice not found')
    return [200, { invoice: invoiceView(inv), lines: inv.lines, payments: inv.payments.filter((p) => !p.voidedAt) }]
  },

  'GET /portal/payments': (ctx) => {
    const denied = customerOnly(ctx)
    if (denied) return denied
    const all = myInvoices(ctx)
      .flatMap((i) => i.payments.filter((p) => !p.voidedAt).map((p) => ({ ...p, invoiceNumber: i.number })))
      .sort((a, b) => b.date.localeCompare(a.date))
    return paginate(all, ctx.query)
  },
}
