import dayjs from 'dayjs'
import type { BillingPeriod, Plan, Subscription, SubscriptionStatus } from './types'

const UNIT: Record<BillingPeriod, [number, dayjs.ManipulateType]> = {
  DAILY: [1, 'day'],
  WEEKLY: [1, 'week'],
  MONTHLY: [1, 'month'],
  YEARLY: [1, 'year'],
}

/**
 * Adds n billing periods to a date, keeping the original anchor day for months
 * (FR-6.9: Jan 31 -> Feb 28 -> Mar 31, not Mar 28).
 */
export function addPeriods(dateISO: string, period: BillingPeriod, n: number, anchorDay?: number | null): string {
  const [size, unit] = UNIT[period]
  let d = dayjs(dateISO).add(size * n, unit)
  if ((period === 'MONTHLY' || period === 'YEARLY') && anchorDay) {
    d = d.date(Math.min(anchorDay, d.daysInMonth()))
  }
  return d.format('YYYY-MM-DD')
}

export interface CycleInfo {
  /** 0..1 share of the current period already used */
  progress: number
  /** days until the next invoice (0 = today) */
  daysLeft: number
  nextDate: string
  dueSoon: boolean
}

/** Where an Active subscription is in its billing period. Null when it isn't being billed. */
export function cycleInfo(sub: Pick<Subscription, 'status' | 'nextBillingDate' | 'anchorDay'>, plan?: Pick<Plan, 'billingPeriod'>): CycleInfo | null {
  if (!plan || !sub.nextBillingDate || (sub.status !== 'ACTIVE' && sub.status !== 'PAUSED')) return null
  const next = dayjs(sub.nextBillingDate)
  const prev = dayjs(addPeriods(sub.nextBillingDate, plan.billingPeriod, -1, sub.anchorDay))
  const today = dayjs().startOf('day')
  const total = Math.max(1, next.diff(prev, 'day'))
  const used = today.diff(prev, 'day')
  const daysLeft = Math.max(0, next.diff(today, 'day'))
  return {
    progress: Math.min(1, Math.max(0, used / total)),
    daysLeft,
    nextDate: sub.nextBillingDate,
    dueSoon: daysLeft <= 3,
  }
}

// ---------------------------------------------------------------------------
// Status actions (SRS 6.4 + 9.5). The SERVER enforces these; the UI uses them
// to show only the buttons that make sense, and to explain disabled ones.

export type SubAction = 'send' | 'confirm' | 'activate' | 'pause' | 'resume' | 'renew' | 'close' | 'cancel'

export interface ActionDef {
  action: SubAction
  label: string
  /** body for PATCH /subscriptions/:id/status */
  body: { status: SubscriptionStatus } | { action: 'renew' }
  danger?: boolean
  primary?: boolean
  confirm?: string
}

const DEFS: Record<SubAction, ActionDef> = {
  send: { action: 'send', label: 'Send quotation', body: { status: 'QUOTATION' }, primary: true },
  confirm: { action: 'confirm', label: 'Confirm', body: { status: 'CONFIRMED' }, primary: true },
  activate: { action: 'activate', label: 'Activate now', body: { status: 'ACTIVE' }, primary: true },
  pause: { action: 'pause', label: 'Pause', body: { status: 'PAUSED' }, confirm: 'Pause billing? No invoices are created while paused.' },
  resume: { action: 'resume', label: 'Resume', body: { status: 'ACTIVE' }, primary: true },
  renew: { action: 'renew', label: 'Renew', body: { action: 'renew' }, confirm: 'Extend the expiry date by one plan term?' },
  close: { action: 'close', label: 'Close', body: { status: 'CLOSED' }, danger: true, confirm: 'Close this subscription? Billing stops and there is no refund for the current period.' },
  cancel: { action: 'cancel', label: 'Cancel', body: { status: 'CANCELLED' }, danger: true, confirm: 'Cancel this subscription? This cannot be undone.' },
}

const NEXT: Record<SubscriptionStatus, SubAction[]> = {
  DRAFT: ['send', 'cancel'],
  QUOTATION: ['confirm', 'cancel'],
  CONFIRMED: ['activate', 'cancel'],
  ACTIVE: ['renew', 'pause', 'close'],
  PAUSED: ['resume', 'close'],
  CLOSED: [],
  CANCELLED: [],
}

/** Valid next actions, each with a reason if a guard blocks it right now. */
export function availableActions(
  sub: Pick<Subscription, 'status' | 'validUntil' | 'startDate'>,
  plan?: Pick<Plan, 'pausable' | 'closable' | 'renewable'>,
  lineCount = 1,
): (ActionDef & { blockedBy?: string })[] {
  const today = dayjs().format('YYYY-MM-DD')
  return NEXT[sub.status].map((a) => {
    let blockedBy: string | undefined
    if (a === 'send' && lineCount === 0) blockedBy = 'Add at least one product line first'
    if (a === 'confirm' && sub.validUntil && today > sub.validUntil) blockedBy = 'This quotation has expired'
    if (a === 'activate' && today < sub.startDate) blockedBy = `Starts on ${dayjs(sub.startDate).format('D MMM YYYY')}; it activates automatically that day`
    if (a === 'pause' && plan && !plan.pausable) blockedBy = "This plan doesn't allow pausing"
    if (a === 'close' && plan && !plan.closable) blockedBy = "This plan doesn't allow closing early"
    if (a === 'renew' && plan && !plan.renewable) blockedBy = "This plan doesn't allow renewal"
    return { ...DEFS[a], blockedBy }
  })
}
