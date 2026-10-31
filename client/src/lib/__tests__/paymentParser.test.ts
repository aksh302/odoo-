import { describe, expect, it } from 'vitest'
import { matchInvoices, parsePaymentText } from '../paymentParser'
import type { Invoice } from '../types'

describe('parsePaymentText', () => {
  it('reads a UPI credit SMS and ignores the account balance', () => {
    const p = parsePaymentText('Rs.4,557.00 credited to A/c XX4821 on 31-10-26 by UPI from CARA STORES (VPA carastores@okbank). UPI Ref No 430912557812. Avl Bal Rs 1,23,456.78')
    expect(p.amount).toBe(455700)
    expect(p.date).toBe('2026-10-31')
    expect(p.method).toBe('UPI')
    expect(p.reference).toBe('430912557812')
    expect(p.payer).toBe('CARA STORES')
  })

  it('reads an NEFT message with UTR and invoice number', () => {
    const p = parsePaymentText('INR 79,826.18 received via NEFT from Sunrise Traders on 30 Oct 2026. UTR: N303261234567890 Ref INV-2026-000439')
    expect(p.amount).toBe(7982618)
    expect(p.method).toBe('BANK_TRANSFER')
    expect(p.reference).toBe('N303261234567890')
    expect(p.invoiceNumber).toBe('INV-2026-000439')
    expect(p.date).toBe('2026-10-30')
  })

  it('fixes letter O for zero in invoice numbers read from photos', () => {
    expect(parsePaymentText('Received 2000 cash for INV-2O26-OOO44O').invoiceNumber).toBe('INV-2026-000440')
  })

  it('reads cheques and day-first dates', () => {
    const p = parsePaymentText('Cheque No 004512 dated 28.10.2026 for Rs 15000/- from Kaveri Foods')
    expect(p.method).toBe('CHEQUE')
    expect(p.date).toBe('2026-10-28')
    expect(p.amount).toBe(1500000)
  })

  it('does not mistake words like "Date" for a month', () => {
    expect(parsePaymentText('Amount Rs. 1,967.82\nDate 31 Oct 2026').date).toBe('2026-10-31')
  })
})

describe('matchInvoices', () => {
  const inv = (id: number, number: string, company: string, total: number) =>
    ({ id, number, customerSnapshot: { name: 'X', company }, total, amountPaid: 0, dueDate: '2026-10-20', status: 'CONFIRMED' }) as Invoice
  const unpaid = [inv(1, 'INV-2026-000455', 'Cara Stores', 231359), inv(2, 'INV-2026-000449', 'Cara Stores', 409821)]

  it('ranks the invoice whose balance equals the amount first', () => {
    const text = 'Rs.2,313.59 credited by UPI from CARA STORES'
    const m = matchInvoices(parsePaymentText(text), text, unpaid)
    expect(m[0].invoice.number).toBe('INV-2026-000455')
    expect(m[0].reasons).toContain('Amount matches the balance due')
  })

  it('returns nothing for a stranger with an unrelated amount', () => {
    const text = 'Rs 1,250.00 credited by UPI from RANDOM PERSON'
    expect(matchInvoices(parsePaymentText(text), text, unpaid)).toHaveLength(0)
  })
})
