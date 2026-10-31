import { describe, it, expect } from 'vitest';
import {
  todayIST, businessDate, dateParts, lastDayOfMonth, clampDay,
  nextPeriodStart, periodEnd, dueDate, isBefore, isOnOrBefore,
  addDays, diffDays, formatDate, mrrMultiplier,
} from '../src/lib/dates';

describe('lib/dates', () => {
  describe('lastDayOfMonth', () => {
    it('returns 28 for Feb 2026 (non-leap)', () => {
      expect(lastDayOfMonth(2026, 2)).toBe(28);
    });

    it('returns 29 for Feb 2024 (leap)', () => {
      expect(lastDayOfMonth(2024, 2)).toBe(29);
    });

    it('returns 31 for Jan', () => {
      expect(lastDayOfMonth(2026, 1)).toBe(31);
    });

    it('returns 30 for Apr', () => {
      expect(lastDayOfMonth(2026, 4)).toBe(30);
    });
  });

  describe('clampDay', () => {
    it('clamps 31 to 28 in Feb 2026', () => {
      expect(clampDay(2026, 2, 31)).toBe(28);
    });

    it('keeps 15 in Feb 2026', () => {
      expect(clampDay(2026, 2, 15)).toBe(15);
    });

    it('clamps 31 to 30 in Apr', () => {
      expect(clampDay(2026, 4, 31)).toBe(30);
    });
  });

  describe('nextPeriodStart', () => {
    it('advances monthly with anchorDay 31: Jan→Feb→Mar', () => {
      const jan31 = businessDate(2026, 1, 31);
      const feb28 = nextPeriodStart(jan31, 'MONTHLY', 31);
      expect(dateParts(feb28)).toEqual({ year: 2026, month: 2, day: 28 });

      const mar31 = nextPeriodStart(feb28, 'MONTHLY', 31);
      expect(dateParts(mar31)).toEqual({ year: 2026, month: 3, day: 31 });
    });

    it('advances monthly with anchorDay 15', () => {
      const oct15 = businessDate(2026, 10, 15);
      const nov15 = nextPeriodStart(oct15, 'MONTHLY', 15);
      expect(dateParts(nov15)).toEqual({ year: 2026, month: 11, day: 15 });
    });

    it('wraps year boundary for monthly', () => {
      const dec15 = businessDate(2026, 12, 15);
      const jan15 = nextPeriodStart(dec15, 'MONTHLY', 15);
      expect(dateParts(jan15)).toEqual({ year: 2027, month: 1, day: 15 });
    });

    it('advances daily by 1 day', () => {
      const d = businessDate(2026, 10, 31);
      const next = nextPeriodStart(d, 'DAILY', 31);
      expect(dateParts(next)).toEqual({ year: 2026, month: 11, day: 1 });
    });

    it('advances weekly by 7 days', () => {
      const d = businessDate(2026, 10, 26);
      const next = nextPeriodStart(d, 'WEEKLY', 26);
      expect(dateParts(next)).toEqual({ year: 2026, month: 11, day: 2 });
    });

    it('advances yearly with anchorDay clamping', () => {
      const feb29_2024 = businessDate(2024, 2, 29);
      const next = nextPeriodStart(feb29_2024, 'YEARLY', 29);
      expect(dateParts(next)).toEqual({ year: 2025, month: 2, day: 28 });
    });
  });

  describe('periodEnd', () => {
    it('returns next period start minus 1 day', () => {
      const oct1 = businessDate(2026, 10, 1);
      const end = periodEnd(oct1, 'MONTHLY', 1);
      expect(dateParts(end)).toEqual({ year: 2026, month: 10, day: 31 });
    });
  });

  describe('dueDate', () => {
    it('adds paymentTerms days to periodStart', () => {
      const oct1 = businessDate(2026, 10, 1);
      const due = dueDate(oct1, 15);
      expect(dateParts(due)).toEqual({ year: 2026, month: 10, day: 16 });
    });
  });

  describe('date comparison', () => {
    it('isBefore works', () => {
      const a = businessDate(2026, 10, 1);
      const b = businessDate(2026, 10, 2);
      expect(isBefore(a, b)).toBe(true);
      expect(isBefore(b, a)).toBe(false);
    });

    it('isOnOrBefore works', () => {
      const a = businessDate(2026, 10, 1);
      expect(isOnOrBefore(a, a)).toBe(true);
    });
  });

  describe('addDays', () => {
    it('adds positive days', () => {
      const d = businessDate(2026, 10, 30);
      expect(dateParts(addDays(d, 3))).toEqual({ year: 2026, month: 11, day: 2 });
    });

    it('adds negative days', () => {
      const d = businessDate(2026, 10, 3);
      expect(dateParts(addDays(d, -5))).toEqual({ year: 2026, month: 9, day: 28 });
    });
  });

  describe('diffDays', () => {
    it('returns positive for a > b', () => {
      const a = businessDate(2026, 10, 15);
      const b = businessDate(2026, 10, 1);
      expect(diffDays(a, b)).toBe(14);
    });
  });

  describe('formatDate', () => {
    it('formats as YYYY-MM-DD', () => {
      expect(formatDate(businessDate(2026, 10, 31))).toBe('2026-10-31');
    });
  });

  describe('mrrMultiplier', () => {
    it('MONTHLY = 1', () => expect(mrrMultiplier('MONTHLY')).toBe(1));
    it('YEARLY = 1/12', () => expect(mrrMultiplier('YEARLY')).toBeCloseTo(1 / 12));
    it('DAILY = 30', () => expect(mrrMultiplier('DAILY')).toBe(30));
    it('WEEKLY = 52/12', () => expect(mrrMultiplier('WEEKLY')).toBeCloseTo(52 / 12));
  });
});

