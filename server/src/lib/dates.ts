/**
 * Date utility library for billing period computation.
 * Business dates use Asia/Kolkata timezone.
 * Billing periods computed from anchorDay, clamped to month length.
 * (Jan 31 → Feb 28 → Mar 31)
 */

const TZ = 'Asia/Kolkata';

/**
 * Get today's date in Asia/Kolkata as a UTC Date (date-only, no time component).
 */
export function todayIST(): Date {
  const now = new Date();
  const istStr = now.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
  const [y, m, d] = istStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Create a business date (UTC midnight) from y/m/d.
 */
export function businessDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Parse a Date to { year, month (1-based), day }.
 */
export function dateParts(d: Date): { year: number; month: number; day: number } {
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/**
 * Get the last day of a given month/year.
 */
export function lastDayOfMonth(year: number, month: number): number {
  // Day 0 of the next month = last day of current month
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Clamp a day to the maximum for a given month/year.
 * e.g., anchorDay 31 in Feb 2026 → 28.
 */
export function clampDay(year: number, month: number, anchorDay: number): number {
  const maxDay = lastDayOfMonth(year, month);
  return Math.min(anchorDay, maxDay);
}

/**
 * Compute the next billing date from the current billing date and billing period.
 * Respects anchorDay clamping for monthly/yearly periods.
 *
 * @param current - current billing date (periodStart)
 * @param billingPeriod - DAILY | WEEKLY | MONTHLY | YEARLY
 * @param anchorDay - the original anchor day of the subscription
 * @returns next billing date
 */
export function nextPeriodStart(
  current: Date,
  billingPeriod: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
  anchorDay: number,
): Date {
  const { year, month } = dateParts(current);

  switch (billingPeriod) {
    case 'DAILY': {
      const next = new Date(current);
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    }
    case 'WEEKLY': {
      const next = new Date(current);
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    }
    case 'MONTHLY': {
      let nextMonth = month + 1;
      let nextYear = year;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
      }
      const day = clampDay(nextYear, nextMonth, anchorDay);
      return businessDate(nextYear, nextMonth, day);
    }
    case 'YEARLY': {
      const nextYear = year + 1;
      const day = clampDay(nextYear, month, anchorDay);
      return businessDate(nextYear, month, day);
    }
  }
}

/**
 * Compute periodEnd = next period start - 1 day.
 * Billing is in advance: periodStart = nextBillingDate, periodEnd = next period start - 1 day.
 */
export function periodEnd(
  periodStart: Date,
  billingPeriod: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY',
  anchorDay: number,
): Date {
  const nextStart = nextPeriodStart(periodStart, billingPeriod, anchorDay);
  const end = new Date(nextStart);
  end.setUTCDate(end.getUTCDate() - 1);
  return end;
}

/**
 * Compute the due date for an invoice: periodStart + paymentTerms days.
 */
export function dueDate(periodStart: Date, paymentTermsDays: number): Date {
  const d = new Date(periodStart);
  d.setUTCDate(d.getUTCDate() + paymentTermsDays);
  return d;
}

/**
 * Check if a date is before another (date-only comparison).
 */
export function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

/**
 * Check if a date is on or before another.
 */
export function isOnOrBefore(a: Date, b: Date): boolean {
  return a.getTime() <= b.getTime();
}

/**
 * Check if two dates are equal (date-only comparison).
 */
export function isSameDate(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

/**
 * Add days to a date.
 */
export function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Difference in days between two dates (a - b).
 */
export function diffDays(a: Date, b: Date): number {
  const msPerDay = 86400000;
  return Math.floor((a.getTime() - b.getTime()) / msPerDay);
}

/**
 * Format a Date as YYYY-MM-DD.
 */
export function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * MRR multiplier per billing period.
 * DAILY → 30, WEEKLY → 52/12 ≈ 4.333, MONTHLY → 1, YEARLY → 1/12
 */
export function mrrMultiplier(billingPeriod: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'): number {
  switch (billingPeriod) {
    case 'DAILY': return 30;
    case 'WEEKLY': return 52 / 12;
    case 'MONTHLY': return 1;
    case 'YEARLY': return 1 / 12;
  }
}

