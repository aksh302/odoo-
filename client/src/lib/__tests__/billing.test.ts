import { describe, expect, it } from 'vitest'
import { addPeriods, availableActions } from '../cycle'
import { estimateInvoice, lineTax } from '../estimate'
import { gstSplit } from '../gst'
import { formatINR, formatINRCompact, toPaise } from '../money'

describe('billing periods (FR-6.9)', () => {
  it('keeps the anchor day across short months', () => {
    expect(addPeriods('2026-01-31', 'MONTHLY', 1, 31)).toBe('2026-02-28')
    expect(addPeriods('2026-02-28', 'MONTHLY', 1, 31)).toBe('2026-03-31')
    expect(addPeriods('2028-01-31', 'MONTHLY', 1, 31)).toBe('2028-02-29') // leap year
  })
  it('adds days, weeks and years', () => {
    expect(addPeriods('2026-10-31', 'DAILY', 1)).toBe('2026-11-01')
    expect(addPeriods('2026-10-31', 'WEEKLY', 2)).toBe('2026-11-14')
    expect(addPeriods('2024-02-29', 'YEARLY', 1, 29)).toBe('2025-02-28')
  })
})

describe('invoice maths (SRS 9.4)', () => {
  it('rounds tax half-up in paise', () => {
    expect(lineTax(10000, 18)).toBe(1800)
    expect(lineTax(333, 18)).toBe(60) // 59.94 -> 60
  })
  it('adds a plan fee with no tax', () => {
    const e = estimateInvoice(99900, [{ quantity: 2, unitPrice: 281900, taxPercent: 18 }])
    expect(e.productsSubtotal).toBe(563800)
    expect(e.tax).toBe(101484)
    expect(e.total).toBe(99900 + 563800 + 101484)
  })
})

describe('GST split', () => {
  it('splits into CGST and SGST inside Tamil Nadu', () => {
    expect(gstSplit(1001, '33ABCDE1234F1Z5')).toMatchObject({ kind: 'INTRA', cgst: 500, sgst: 501, igst: 0 })
  })
  it('uses IGST for another state', () => {
    expect(gstSplit(1000, '29ABCDE1234F1Z5')).toMatchObject({ kind: 'INTER', igst: 1000, placeOfSupply: 'Karnataka (29)' })
  })
  it('treats a buyer without GSTIN as local', () => {
    expect(gstSplit(1000, null).kind).toBe('INTRA')
  })
})

describe('status actions (SRS 9.5)', () => {
  it('blocks pausing when the plan does not allow it', () => {
    const a = availableActions({ status: 'ACTIVE', startDate: '2026-01-01' }, { pausable: false, closable: true, renewable: true })
    expect(a.find((x) => x.action === 'pause')?.blockedBy).toMatch(/doesn't allow pausing/)
  })
  it('offers no actions on closed or cancelled subscriptions', () => {
    expect(availableActions({ status: 'CLOSED', startDate: '2026-01-01' })).toHaveLength(0)
    expect(availableActions({ status: 'CANCELLED', startDate: '2026-01-01' })).toHaveLength(0)
  })
})

describe('money', () => {
  it('formats rupees the Indian way', () => {
    expect(formatINR(11706767)).toBe('₹1,17,067.67')
    expect(formatINRCompact(12000000)).toBe('₹1.2L')
    expect(formatINRCompact(4500000)).toBe('₹45K')
  })
  it('converts rupees to paise without float drift', () => {
    expect(toPaise(19.99)).toBe(1999)
    expect(toPaise('1234.5')).toBe(123450)
  })
})
