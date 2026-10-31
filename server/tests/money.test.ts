import { describe, it, expect } from 'vitest';
import {
  roundHalfUp, lineAmount, calcDiscount, calcTax, calcLineTotals, formatPaise, toPaise
} from '../src/lib/money';

describe('lib/money', () => {
  describe('roundHalfUp', () => {
    it('rounds 0.5 up', () => {
      expect(roundHalfUp(2.5)).toBe(3);
    });

    it('rounds 0.4 down', () => {
      expect(roundHalfUp(2.4)).toBe(2);
    });

    it('handles negative numbers', () => {
      expect(roundHalfUp(-2.5)).toBe(-2);
    });

    it('returns integers unchanged', () => {
      expect(roundHalfUp(100)).toBe(100);
    });
  });

  describe('lineAmount', () => {
    it('multiplies quantity by unit price', () => {
      expect(lineAmount(3, 15000)).toBe(45000);
    });

    it('returns 0 for zero quantity', () => {
      expect(lineAmount(0, 15000)).toBe(0);
    });
  });

  describe('calcDiscount', () => {
    it('applies FIXED discount in paise', () => {
      expect(calcDiscount(100000, 'FIXED', 20000)).toBe(20000);
    });

    it('caps FIXED discount at line amount', () => {
      expect(calcDiscount(10000, 'FIXED', 20000)).toBe(10000);
    });

    it('applies PERCENT discount with half-up rounding', () => {
      // 10% of 150000 = 15000
      expect(calcDiscount(150000, 'PERCENT', 10)).toBe(15000);
    });

    it('rounds PERCENT discount half-up', () => {
      // 15% of 33333 = 4999.95 → 5000
      expect(calcDiscount(33333, 'PERCENT', 15)).toBe(5000);
    });
  });

  describe('calcTax', () => {
    it('calculates 18% GST', () => {
      // 18% of 100000 = 18000
      expect(calcTax(100000, 18)).toBe(18000);
    });

    it('rounds half-up', () => {
      // 18% of 33333 = 5999.94 → Math.round → 5999 (rounds down since .94 < .5 from next int)
      // Actually: Math.round(5999.94) = 6000. Wait: 5999.94 rounds to 6000.
      // Correct: 18% of 55555 = 9999.9 → 10000
      expect(calcTax(55555, 18)).toBe(10000);
      // And: 18% of 33334 = 6000.12 → 6000
      expect(calcTax(33334, 18)).toBe(6000);
    });

    it('returns 0 for 0% tax', () => {
      expect(calcTax(100000, 0)).toBe(0);
    });
  });

  describe('calcLineTotals', () => {
    it('computes amount → discount → tax in order', () => {
      // qty 2, unit price 150000 (₹1500)
      // amount = 300000
      // 10% discount = 30000
      // after discount = 270000
      // 18% tax on 270000 = 48600
      // lineTotal = 270000 + 48600 = 318600
      const result = calcLineTotals(2, 150000, 'PERCENT', 10, 18);
      expect(result.amount).toBe(300000);
      expect(result.discountAmount).toBe(30000);
      expect(result.taxAmount).toBe(48600);
      expect(result.lineTotal).toBe(318600);
    });

    it('works without discount or tax', () => {
      const result = calcLineTotals(1, 99900);
      expect(result.amount).toBe(99900);
      expect(result.discountAmount).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.lineTotal).toBe(99900);
    });
  });

  describe('formatPaise', () => {
    it('formats paise as INR', () => {
      expect(formatPaise(150000)).toContain('1,500.00');
    });
  });

  describe('toPaise', () => {
    it('converts rupees to paise', () => {
      expect(toPaise(1500)).toBe(150000);
    });

    it('rounds fractional paise half-up', () => {
      expect(toPaise(15.005)).toBe(1501);
    });
  });
});
