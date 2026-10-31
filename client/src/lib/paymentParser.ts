// Reads payment details out of free text: a UPI/bank SMS, a pasted email,
// the OCR text of a receipt photo, or a typed note like
// "Received 4,557 cash from Cara Stores for INV-2026-000455".
// Pure functions, no network: easy to test and works offline.

import type { Invoice, PaymentMethod } from './types'

export interface ParsedPayment {
  amount?: number // paise
  date?: string // YYYY-MM-DD
  reference?: string
  method?: PaymentMethod
  invoiceNumber?: string
  payer?: string
  /** the bits of text each value came from, to show the user */
  found: Partial<Record<'amount' | 'date' | 'reference' | 'method' | 'invoiceNumber' | 'payer', string>>
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** OCR often swaps letters and digits inside numbers. */
function fixDigits(s: string) {
  return s.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8')
}

const toPaise = (raw: string) => {
  const n = Number(raw.replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined
}

const pad = (n: number) => String(n).padStart(2, '0')

function validDate(y: number, m: number, d: number) {
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return undefined
  return `${y}-${pad(m)}-${pad(d)}`
}

// ---------------------------------------------------------------------------

function findAmount(text: string): [number, string] | undefined {
  // "Rs. 4,557.00", "Rs4557", "INR 4,557", "₹ 4,557.00", "Amount: 4,557.00"
  const currency = /(?:rs\.?|inr|₹)\s*:?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi
  const labelled = /(?:amount|amt|total|paid|received|credited|debited|sent)[^0-9\n]{0,20}([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi
  const KEY = /(credited|received|paid|payment of|sent|debited|amount|amt|total)/i

  const hits: { paise: number; snippet: string; score: number }[] = []
  for (const re of [currency, labelled]) {
    for (const m of text.matchAll(re)) {
      const paise = toPaise(m[1])
      if (!paise || paise < 100) continue // ignore tiny numbers (₹1 or less)
      const around = text.slice(Math.max(0, (m.index ?? 0) - 30), (m.index ?? 0) + m[0].length + 10)
      // Balances are not the payment amount: "Avl Bal Rs 12,000"
      const isBalance = /(avl|available|bal(ance)?)\s*(bal)?[^0-9]{0,8}$/i.test(text.slice(Math.max(0, (m.index ?? 0) - 16), m.index))
      hits.push({ paise, snippet: m[0].trim(), score: (re === currency ? 2 : 1) + (KEY.test(around) ? 3 : 0) - (isBalance ? 10 : 0) })
    }
  }
  if (!hits.length) return undefined
  hits.sort((a, b) => b.score - a.score || b.paise - a.paise)
  return hits[0].score > -5 ? [hits[0].paise, hits[0].snippet] : undefined
}

function findDate(text: string): [string, string] | undefined {
  // 31 Oct 2026, 31-Oct-26, Oct 31, 2026
  const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*'
  for (const m of text.matchAll(new RegExp(String.raw`\b(\d{1,2})[\s\-/.]*${MON}[\s\-/.,]*(\d{2,4})\b`, 'gi'))) {
    const mi = MONTHS.indexOf(m[2].toLowerCase())
    const d = mi >= 0 ? validDate(Number(m[3]), mi + 1, Number(m[1])) : undefined
    if (d) return [d, m[0]]
  }
  for (const m of text.matchAll(new RegExp(String.raw`\b${MON}\.?\s+(\d{1,2}),?\s+(\d{4})\b`, 'gi'))) {
    const mi = MONTHS.indexOf(m[1].toLowerCase())
    const d = mi >= 0 ? validDate(Number(m[3]), mi + 1, Number(m[2])) : undefined
    if (d) return [d, m[0]]
  }
  // 2026-10-31
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const d = validDate(Number(m[1]), Number(m[2]), Number(m[3]))
    if (d) return [d, m[0]]
  }
  // 31/10/2026, 31-10-26, 31.10.2026 (Indian order: day first)
  for (const m of text.matchAll(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/g)) {
    const d = validDate(Number(m[3]), Number(m[2]), Number(m[1]))
    if (d) return [d, m[0]]
  }
  return undefined
}

function findReference(text: string): [string, string] | undefined {
  const labelled =
    /(?:utr|rrn|upi\s*ref(?:erence)?|ref(?:erence)?|txn|transaction|cheque|chq)\.?\s*(?:no|number|id)?\.?\s*[:#\-]?\s*([A-Z0-9]{6,22})/i
  const m = text.match(labelled)
  if (m && /\d/.test(m[1])) return [m[1].toUpperCase(), m[0]]
  // A bare 12-digit number is usually a UPI RRN / IMPS reference.
  const bare = text.match(/\b(\d{12})\b/)
  if (bare) return [bare[1], bare[0]]
  return undefined
}

function findMethod(text: string): [PaymentMethod, string] | undefined {
  const rules: [PaymentMethod, RegExp][] = [
    ['CHEQUE', /\b(cheque|chq)\b/i],
    ['UPI', /\b(upi|vpa|bhim)\b|@[a-z]{2,}\b/i],
    ['BANK_TRANSFER', /\b(neft|imps|rtgs|bank transfer|net ?banking|a\/c|acct)\b/i],
    ['CARD', /\b(card|visa|mastercard|rupay|pos)\b/i],
    ['CASH', /\bcash\b/i],
  ]
  for (const [method, re] of rules) {
    const m = text.match(re)
    if (m) return [method, m[0]]
  }
  return undefined
}

function findInvoice(text: string): [string, string] | undefined {
  const m = text.match(/\bINV[\s\-_.]*([0-9OoIl]{4})[\s\-_.]*([0-9OoIlSB]{6})\b/i)
  if (!m) return undefined
  return [`INV-${fixDigits(m[1])}-${fixDigits(m[2])}`, m[0]]
}

function findPayer(text: string): [string, string] | undefined {
  const tail = String.raw`\s+([A-Z][A-Za-z.&'\- ]{2,40}?)(?=\s+(?:for|on|via|towards|against|ref|utr|upi|rs|inr|₹|\d)|\s*[,.\n(]|$)`
  // Most specific wording first, so "by UPI from CARA STORES" finds the name after "from".
  for (const lead of ['received from', 'paid by', 'from', 'by']) {
    const m = text.match(new RegExp(String.raw`\b${lead}` + tail, 'i'))
    if (!m) continue
    const name = m[1].trim()
    if (/^(upi|neft|imps|rtgs|bank|cash|cheque|card)\b/i.test(name) || !/^[A-Z]/.test(name)) continue
    return [name, m[0]]
  }
  return undefined
}

export function parsePaymentText(raw: string): ParsedPayment {
  const text = raw.replace(/ /g, ' ').replace(/[ \t]+/g, ' ')
  const out: ParsedPayment = { found: {} }
  const a = findAmount(text)
  if (a) [out.amount, out.found.amount] = a
  const d = findDate(text)
  if (d) [out.date, out.found.date] = d
  const r = findReference(text)
  if (r) [out.reference, out.found.reference] = r
  const mt = findMethod(text)
  if (mt) [out.method, out.found.method] = mt
  const inv = findInvoice(text)
  if (inv) [out.invoiceNumber, out.found.invoiceNumber] = inv
  const p = findPayer(text)
  if (p) [out.payer, out.found.payer] = p
  return out
}

// ---------------------------------------------------------------------------

export interface InvoiceMatch {
  invoice: Invoice
  score: number
  reasons: string[]
}

const words = (s?: string | null) =>
  (s ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !['the', 'and', 'pvt', 'ltd', 'llp', 'private', 'limited'].includes(w))

/** Ranks unpaid invoices by how well they fit what was read. Best first. */
export function matchInvoices(parsed: ParsedPayment, text: string, unpaid: Invoice[]): InvoiceMatch[] {
  const lower = text.toLowerCase()
  return unpaid
    .map((inv) => {
      const balance = inv.total - inv.amountPaid
      const reasons: string[] = []
      let score = 0
      if (parsed.invoiceNumber && parsed.invoiceNumber === inv.number) {
        score += 100
        reasons.push('Invoice number is in the text')
      }
      if (parsed.amount) {
        if (parsed.amount === balance) {
          score += 50
          reasons.push('Amount matches the balance due')
        } else if (parsed.amount === inv.total) {
          score += 40
          reasons.push('Amount matches the invoice total')
        } else if (parsed.amount < balance) {
          score += 5
          reasons.push('Could be a part payment')
        }
      }
      const names = [...words(inv.customerSnapshot.company), ...words(inv.customerSnapshot.name)]
      const hit = names.find((w) => lower.includes(w) && !/^\d+$/.test(w))
      if (hit) {
        score += 30
        reasons.push(`Mentions ${inv.customerSnapshot.company || inv.customerSnapshot.name}`)
      }
      return { invoice: inv, score, reasons }
    })
    .filter((m) => m.score >= 30 || (m.score > 0 && m.reasons.some((r) => r.startsWith('Amount'))))
    .sort((a, b) => b.score - a.score || a.invoice.dueDate.localeCompare(b.invoice.dueDate))
    .slice(0, 5)
}
