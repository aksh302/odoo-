import { describe, expect, it } from 'vitest'
import { matchStatement, readStatement } from '../statement'
import type { Invoice } from '../types'

const inv = (id: number, number: string, company: string, total: number, amountPaid = 0) =>
  ({ id, number, customerSnapshot: { name: 'Contact', company }, total, amountPaid, dueDate: '2026-10-20', status: 'CONFIRMED' }) as Invoice

const CSV = `Account Statement,,,,,
Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance
28/10/2026,28/10/2026,"NEFT-N302612345678-SUNRISE TRADERS 2-INV-2026-000439",N302612345678,,"79,826.18","3,12,000.00"
29/10/2026,29/10/2026,UPI/430912001021/CARA STORES/carastores@okbank,430912001021,,2313.59,"3,14,313.59"
30/10/2026,30/10/2026,BANK CHARGES,,59.00,,"3,14,254.59"
31/10/2026,31/10/2026,IMPS/P2A/ORBIT LABS 1/Payment,612345678901,,4000.00,
31/10/2026,31/10/2026,Closing balance,,,,"3,18,254.59"`

describe('readStatement', () => {
  it('keeps credits and skips debits and balance rows', () => {
    const r = readStatement(CSV)
    expect(r.credits.map((c) => c.amount)).toEqual([7982618, 231359, 400000])
    expect(r.skipped).toBe(2)
  })

  it('reads dates, methods and references', () => {
    const [neft, upi, imps] = readStatement(CSV).credits
    expect(neft.date).toBe('2026-10-28')
    expect(neft.method).toBe('BANK_TRANSFER')
    expect(neft.reference).toBe('N302612345678')
    expect(upi.method).toBe('UPI')
    expect(imps.method).toBe('BANK_TRANSFER')
  })

  it('reads one transaction per line when there is no header', () => {
    const r = readStatement('Rs.2,313.59 credited to A/c XX4821 on 31-10-26 by UPI from CARA STORES\nRs 500 debited for card payment')
    expect(r.credits).toHaveLength(1)
    expect(r.credits[0].amount).toBe(231359)
    expect(r.skipped).toBe(1)
  })
})

describe('matchStatement', () => {
  const unpaid = [
    inv(1, 'INV-2026-000439', 'Sunrise Traders 2', 7982618),
    inv(2, 'INV-2026-000455', 'Cara Stores', 231359),
    inv(3, 'INV-2026-000449', 'Cara Stores', 409821),
    inv(4, 'INV-2026-000440', 'Orbit Labs 1', 819642),
  ]

  it('matches by invoice number, then exact balance and name', () => {
    const m = matchStatement(readStatement(CSV).credits, unpaid)
    expect(m[0].match?.invoice.number).toBe('INV-2026-000439')
    expect(m[0].confidence).toBe('high')
    expect(m[1].match?.invoice.number).toBe('INV-2026-000455')
    expect(m[1].confidence).toBe('high')
  })

  it('treats a smaller amount from a known customer as a likely part payment', () => {
    const m = matchStatement(readStatement(CSV).credits, unpaid)
    expect(m[2].match?.invoice.number).toBe('INV-2026-000440')
    expect(m[2].confidence).toBe('medium')
  })

  it('never uses one invoice twice', () => {
    const two = readStatement('Rs 2313.59 credited by UPI from CARA STORES\nRs 2313.59 credited by UPI from CARA STORES').credits
    const m = matchStatement(two, unpaid)
    const ids = m.map((x) => x.match?.invoice.id).filter(Boolean)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
