import dayjs from 'dayjs'
import type { BillingPeriod } from '../../lib/types'
import { plans } from './catalog'
import { invoices, isOverdue } from './ledger'
import { subs } from './subscriptions'
import { requireRole, todayISO } from './util'
import type { MockCtx, MockRoutes } from './util'

// GET /reports/summary and /reports/export.csv (SRS 9.6, FR-8.1 to 8.8).
// Date range applies to payment dates (revenue collected). Outstanding and overdue are "as of today".

const TO_MONTHLY: Record<BillingPeriod, number> = { DAILY: 30, WEEKLY: 52 / 12, MONTHLY: 1, YEARLY: 1 / 12 }

export interface Summary {
  activeSubscriptions: number
  mrr: number
  arr: number
  revenueCollected: number
  outstanding: number
  overdueCount: number
  overdueAmount: number
  aging: { d0_30: number; d31_60: number; d60plus: number }
  counts: { paid: number; outstanding: number; overdue: number }
  revenueByMonth: { month: string; collected: number }[]
}

function summarize(q: Record<string, any>): Summary {
  const customerId = q.customerId ? Number(q.customerId) : undefined
  const planId = q.planId ? Number(q.planId) : undefined
  const from: string = q.from || dayjs().subtract(11, 'month').startOf('month').format('YYYY-MM-DD')
  const to: string = q.to || todayISO()

  const subOk = (s: { customerId: number; planId: number }) => (!customerId || s.customerId === customerId) && (!planId || s.planId === planId)
  const subById = new Map(subs.map((s) => [s.id, s]))

  const active = subs.filter((s) => s.status === 'ACTIVE' && subOk(s))
  const mrr = Math.round(
    active.reduce((sum, s) => {
      const plan = plans.find((p) => p.id === s.planId)!
      const recurring = plan.price + s.lines.reduce((a, l) => a + l.amount, 0)
      return sum + recurring * TO_MONTHLY[plan.billingPeriod]
    }, 0),
  )

  const invs = invoices.filter((i) => {
    const s = subById.get(i.subscriptionId)
    return s ? subOk(s) : !customerId && !planId
  })
  const payments = invs.flatMap((i) => i.payments.filter((p) => !p.voidedAt))
  const inRange = payments.filter((p) => p.date >= from && p.date <= to)

  const open = invs.filter((i) => i.status === 'CONFIRMED' && i.amountPaid < i.total)
  const overdue = open.filter(isOverdue)
  const aging = { d0_30: 0, d31_60: 0, d60plus: 0 }
  overdue.forEach((i) => {
    const late = dayjs().diff(dayjs(i.dueDate), 'day')
    const due = i.total - i.amountPaid
    if (late <= 30) aging.d0_30 += due
    else if (late <= 60) aging.d31_60 += due
    else aging.d60plus += due
  })

  // One bucket per month in the range, including empty months.
  const months: { month: string; collected: number }[] = []
  for (let m = dayjs(from).startOf('month'); !m.isAfter(dayjs(to), 'month'); m = m.add(1, 'month')) {
    const key = m.format('YYYY-MM')
    months.push({ month: key, collected: inRange.filter((p) => p.date.startsWith(key)).reduce((a, p) => a + p.amount, 0) })
  }

  return {
    activeSubscriptions: active.length,
    mrr,
    arr: mrr * 12,
    revenueCollected: inRange.reduce((a, p) => a + p.amount, 0),
    outstanding: open.reduce((a, i) => a + i.total - i.amountPaid, 0),
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((a, i) => a + i.total - i.amountPaid, 0),
    aging,
    counts: { paid: invs.filter((i) => i.status === 'PAID').length, outstanding: open.length, overdue: overdue.length },
    revenueByMonth: months,
  }
}

const backOffice = (ctx: MockCtx) => requireRole(ctx, 'ADMIN', 'STAFF')
const rupees = (paise: number) => (paise / 100).toFixed(2)

export const reportRoutes: MockRoutes = {
  'GET /reports/summary': (ctx) => backOffice(ctx) ?? [200, summarize(ctx.query)],

  'GET /reports/export.csv': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const s = summarize(ctx.query)
    const rows = [
      ['Metric', 'Value (INR)'],
      ['Active subscriptions', String(s.activeSubscriptions)],
      ['MRR', rupees(s.mrr)],
      ['ARR', rupees(s.arr)],
      ['Revenue collected', rupees(s.revenueCollected)],
      ['Outstanding', rupees(s.outstanding)],
      ['Overdue invoices', String(s.overdueCount)],
      ['Overdue amount', rupees(s.overdueAmount)],
      ['Overdue 0-30 days', rupees(s.aging.d0_30)],
      ['Overdue 31-60 days', rupees(s.aging.d31_60)],
      ['Overdue 60+ days', rupees(s.aging.d60plus)],
      [],
      ['Month', 'Collected (INR)'],
      ...s.revenueByMonth.map((m) => [m.month, rupees(m.collected)]),
    ]
    return [200, rows.map((r) => r.join(',')).join('\n')]
  },
}
