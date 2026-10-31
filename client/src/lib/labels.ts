import type { BillingPeriod } from './types'

/** "₹999 / month" */
export const PERIOD_WORD: Record<BillingPeriod, string> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
}

/** "Bills monthly" */
export const PERIOD_ADVERB: Record<BillingPeriod, string> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
}
