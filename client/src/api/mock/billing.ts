import { addPeriods } from '../../lib/cycle'
import type { Invoice, PaymentMethod } from '../../lib/types'
import { plans } from './catalog'
import { applyPayment, buildInvoice, discounts, invoices, isOverdue, runs } from './ledger'
import type { InvoiceRecord } from './ledger'
import { findCustomer, snapshotOf, subs } from './subscriptions'
import { audit, contains, fail, nextId, paginate, requireRole, todayISO } from './util'
import type { MockCtx, MockRoutes } from './util'

// Invoices, billing runs and payments — SRS 3.3, 8.1, 9.5, 9.6.

const backOffice = (ctx: MockCtx) => requireRole(ctx, 'ADMIN', 'STAFF')
const METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'OTHER']

/** List/detail shape: everything except lines and payments, plus the derived overdue flag. */
function invoiceView(i: InvoiceRecord): Invoice {
  const { lines: _l, payments: _p, ...rest } = i
  return { ...rest, overdue: isOverdue(i) }
}

let running = false

/** The billing run (SRS 3.3): catch-up loop, one invoice per missed period, never twice. */
function runBilling(asOf: string, triggeredBy: string) {
  const run = { id: nextId(), startedAt: new Date().toISOString(), finishedAt: null as string | null, triggeredBy, asOf, created: 0, skipped: 0, failed: 0, errorLog: [] as { subscriptionNumber: string; message: string }[] }
  const createdIds: number[] = []
  for (const s of subs) {
    if (s.status !== 'ACTIVE' || !s.nextBillingDate || s.nextBillingDate > asOf) continue
    const plan = plans.find((p) => p.id === s.planId)
    const customer = findCustomer(s.customerId)
    if (!plan || !customer) {
      run.failed++
      run.errorLog.push({ subscriptionNumber: s.number, message: 'Plan or customer missing' })
      continue
    }
    // Simulated failure so the "failed" path can be demoed: no product lines and no plan fee.
    if (plan.price === 0 && s.lines.length === 0) {
      run.failed++
      run.errorLog.push({ subscriptionNumber: s.number, message: 'Nothing to bill: plan fee is 0 and there are no products' })
      continue
    }
    let periods = 0
    while (s.nextBillingDate && s.nextBillingDate <= asOf && periods < 400) {
      const ps = s.nextBillingDate
      const duplicate = invoices.some((i) => i.subscriptionId === s.id && i.periodStart === ps && i.status !== 'CANCELLED')
      if (duplicate) {
        run.skipped++
      } else {
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
        })
        inv.createdAt = new Date().toISOString()
        invoices.push(inv)
        createdIds.push(inv.id)
        run.created++
      }
      periods++
      // Anchor day keeps month-end right: Jan 31 -> Feb 28 -> Mar 31 (FR-6.9)
      s.nextBillingDate = addPeriods(ps, plan.billingPeriod, 1, s.anchorDay)
    }
  }
  run.finishedAt = new Date().toISOString()
  runs.unshift({ ...run, errorLog: run.errorLog.length ? run.errorLog : null })
  return { runId: run.id, created: run.created, skipped: run.skipped, failed: run.failed, invoiceIds: createdIds }
}

const findInvoice = (id: string) => invoices.find((i) => i.id === Number(id))

export const billingRoutes: MockRoutes = {
  // ---------- billing runs ----------
  'POST /billing/run': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    if (running) return fail(409, 'BILLING_RUNNING', 'Another billing run is in progress')
    running = true
    try {
      // Mock behaves as DEMO_MODE=true: asOf is honoured.
      const asOf = ctx.body.asOf || todayISO()
      const result = runBilling(asOf, ctx.me?.name ?? 'user')
      audit(ctx, 'BILLING_RUN', 'BillingRun', result.runId, `Run as of ${asOf}`, null, { created: result.created, skipped: result.skipped, failed: result.failed })
      return [200, result]
    } finally {
      running = false
    }
  },
  'GET /billing/runs': (ctx) => backOffice(ctx) ?? paginate(runs, ctx.query),

  // ---------- invoices ----------
  'GET /invoices': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const { status, customerId, subscriptionId, overdue, from, to, q = '' } = ctx.query
    const all = [...invoices]
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart) || b.id - a.id)
      .filter((i) => (status ? i.status === status : true))
      .filter((i) => (customerId ? i.customerId === Number(customerId) : true))
      .filter((i) => (subscriptionId ? i.subscriptionId === Number(subscriptionId) : true))
      .filter((i) => (overdue === 'true' || overdue === true ? isOverdue(i) : true))
      .filter((i) => (from ? i.periodStart >= from : true))
      .filter((i) => (to ? i.periodStart <= to : true))
      .filter((i) => contains(i.number, q) || contains(i.customerSnapshot.name, q) || contains(i.customerSnapshot.company, q) || contains(i.subscriptionNumber, q))
      .map(invoiceView)
    return paginate(all, ctx.query)
  },

  'GET /invoices/:id': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const inv = findInvoice(ctx.params.id)
    if (!inv) return fail(404, 'NOT_FOUND', 'Invoice not found')
    return [200, { invoice: invoiceView(inv), lines: inv.lines, payments: inv.payments }]
  },

  'PATCH /invoices/:id/status': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const inv = findInvoice(ctx.params.id)
    if (!inv) return fail(404, 'NOT_FOUND', 'Invoice not found')
    const to = ctx.body.status
    if (to === 'CONFIRMED') {
      if (inv.status !== 'DRAFT') return fail(409, 'INVOICE_LOCKED', 'Only drafts can be confirmed')
      audit(ctx, 'INVOICE_STATUS', 'Invoice', inv.id, inv.number, { status: inv.status }, { status: 'CONFIRMED' })
      inv.status = 'CONFIRMED'
    } else if (to === 'CANCELLED') {
      if (inv.status !== 'DRAFT' && inv.status !== 'CONFIRMED') return fail(409, 'INVOICE_LOCKED', 'This invoice cannot be cancelled')
      if (inv.amountPaid > 0) return fail(409, 'INVOICE_LOCKED', 'Invoices with payments cannot be cancelled')
      // Return discount usage (FR-5.11)
      new Set(inv.lines.map((l) => l.discountId).filter(Boolean)).forEach((id) => {
        const d = discounts.find((x) => x.id === id)
        if (d && d.usedCount > 0) d.usedCount -= 1
      })
      audit(ctx, 'INVOICE_STATUS', 'Invoice', inv.id, inv.number, { status: inv.status }, { status: 'CANCELLED' })
      inv.status = 'CANCELLED'
    } else {
      return fail(409, 'INVALID_TRANSITION', 'Unsupported status')
    }
    return [200, { invoice: invoiceView(inv) }]
  },

  'POST /invoices/confirm-drafts': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const ids: number[] | undefined = ctx.body.ids
    let confirmed = 0
    invoices.forEach((i) => {
      if (i.status === 'DRAFT' && (!ids || ids.includes(i.id))) {
        i.status = 'CONFIRMED'
        confirmed++
      }
    })
    return [200, { confirmed }]
  },

  // Not in SRS 9.6 yet: payment reminders for overdue invoices.
  'POST /invoices/:id/remind': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const inv = findInvoice(ctx.params.id)
    if (!inv) return fail(404, 'NOT_FOUND', 'Invoice not found')
    if (inv.status !== 'CONFIRMED' || inv.amountPaid >= inv.total) return fail(409, 'INVOICE_LOCKED', 'Only unpaid confirmed invoices can be chased')
    const channel = ctx.body.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL'
    const r = { at: new Date().toISOString(), channel, by: ctx.me?.name ?? null } as const
    inv.reminders = [r, ...(inv.reminders ?? [])]
    audit(ctx, 'INVOICE_REMIND', 'Invoice', inv.id, inv.number, null, { channel })
    return [200, { invoice: invoiceView(inv) }]
  },
  'POST /invoices/remind-overdue': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const today = new Date().toISOString().slice(0, 10)
    let sent = 0
    invoices.filter(isOverdue).forEach((inv) => {
      // At most one email reminder per invoice per day.
      if (inv.reminders?.some((r) => r.channel === 'EMAIL' && r.at.slice(0, 10) === today)) return
      inv.reminders = [{ at: new Date().toISOString(), channel: 'EMAIL', by: ctx.me?.name ?? null }, ...(inv.reminders ?? [])]
      audit(ctx, 'INVOICE_REMIND', 'Invoice', inv.id, inv.number, null, { channel: 'EMAIL' })
      sent++
    })
    return [200, { sent }]
  },

  'POST /invoices/:id/send': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const inv = findInvoice(ctx.params.id)
    if (!inv) return fail(404, 'NOT_FOUND', 'Invoice not found')
    if (inv.status === 'DRAFT' || inv.status === 'CANCELLED') return fail(409, 'INVOICE_LOCKED', 'Confirm the invoice before sending it')
    inv.emailedAt = new Date().toISOString()
    return [200, { emailedAt: inv.emailedAt }]
  },

  // ---------- payments ----------
  'GET /payments': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const { invoiceId, customerId, from, to, q = '' } = ctx.query
    const all = invoices
      .flatMap((i) => i.payments.map((p) => ({ ...p, invoiceNumber: i.number, customerName: i.customerSnapshot.company || i.customerSnapshot.name, customerId: i.customerId })))
      .filter((p) => (invoiceId ? p.invoiceId === Number(invoiceId) : true))
      .filter((p) => (customerId ? p.customerId === Number(customerId) : true))
      .filter((p) => (from ? p.date >= from : true))
      .filter((p) => (to ? p.date <= to : true))
      .filter((p) => contains(p.invoiceNumber, q) || contains(p.customerName, q) || contains(p.reference, q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    return paginate(all, ctx.query)
  },

  'POST /payments': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const { invoiceId, method, amount, date, reference, note } = ctx.body
    const inv = invoices.find((i) => i.id === invoiceId)
    if (!inv) return fail(404, 'NOT_FOUND', 'Invoice not found')
    if (inv.status !== 'CONFIRMED') return fail(409, 'INVOICE_LOCKED', 'Payments can only be recorded on confirmed invoices')
    const fields: Record<string, string> = {}
    if (!METHODS.includes(method)) fields.method = 'Choose a method'
    if (!(Number.isInteger(amount) && amount > 0)) fields.amount = 'Enter an amount above 0'
    if (!date) fields.date = 'Choose a date'
    else if (date > todayISO()) fields.date = 'Cannot be in the future'
    if (Object.keys(fields).length) return fail(400, 'VALIDATION_ERROR', 'Invalid payment', fields)
    const outstanding = inv.total - inv.amountPaid
    if (amount > outstanding) return fail(409, 'OVERPAYMENT', 'Amount exceeds outstanding balance', { amount: `Only ${(outstanding / 100).toFixed(2)} is outstanding` })
    const payment = applyPayment(inv, { method, amount, date, reference: reference || null, note: note || null })
    audit(ctx, 'PAYMENT_CREATE', 'Invoice', inv.id, inv.number, { amountPaid: inv.amountPaid - amount }, { amount, method, amountPaid: inv.amountPaid, status: inv.status })
    return [201, { payment, invoice: invoiceView(inv) }]
  },

  'POST /payments/:id/void': (ctx) => {
    const denied = requireRole(ctx, 'ADMIN')
    if (denied) return denied
    const inv = invoices.find((i) => i.payments.some((p) => p.id === Number(ctx.params.id)))
    const p = inv?.payments.find((x) => x.id === Number(ctx.params.id))
    if (!inv || !p) return fail(404, 'NOT_FOUND', 'Payment not found')
    if (p.voidedAt) return fail(409, 'INVALID_TRANSITION', 'Payment already voided')
    if (!String(ctx.body.reason ?? '').trim()) return fail(400, 'VALIDATION_ERROR', 'Reason required', { reason: 'Give a reason' })
    audit(ctx, 'PAYMENT_VOID', 'Invoice', inv.id, inv.number, { amount: p.amount, status: inv.status }, { reason: ctx.body.reason.trim() })
    p.voidedAt = new Date().toISOString()
    p.voidReason = ctx.body.reason.trim()
    inv.amountPaid -= p.amount
    if (inv.status === 'PAID' && inv.amountPaid < inv.total) inv.status = 'CONFIRMED'
    return [200, { invoice: invoiceView(inv) }]
  },
}

// A couple of drafts exist so "Confirm drafts" has something to do in the demo.
;(() => {
  const recent = invoices.filter((i) => i.status === 'CONFIRMED' && i.amountPaid === 0).slice(-2)
  recent.forEach((i) => (i.status = 'DRAFT'))
})()
