// Turns a bank statement (CSV export, or rows copied from a PDF) into credit lines,
// then matches each credit to an unpaid invoice. Pure functions, no network.

import { matchInvoices, parsePaymentText } from './paymentParser'
import type { InvoiceMatch } from './paymentParser'
import type { Invoice, PaymentMethod } from './types'

export interface StatementLine {
  row: number
  date?: string // YYYY-MM-DD
  narration: string
  amount: number // paise, credits only
  reference?: string
  method: PaymentMethod
}

export interface StatementResult {
  credits: StatementLine[]
  skipped: number // debits, totals, blank or unreadable rows
}

/** Minimal CSV splitter that understands quoted fields ("a, b"). */
export function splitCsvLine(line: string, sep = ','): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"'
        i++
      } else quoted = !quoted
    } else if (ch === sep && !quoted) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

const num = (s?: string) => {
  if (!s) return undefined
  const cleaned = s.replace(/[₹,\s]|INR|Rs\.?/gi, '').replace(/\((.*)\)/, '-$1')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined
  return Math.round(Number(cleaned) * 100)
}

const find = (headers: string[], ...names: RegExp[]) => headers.findIndex((h) => names.some((n) => n.test(h)))

/**
 * Reads a statement. Works with typical Indian bank CSV exports
 * (Date, Narration/Description/Particulars, Ref/Chq No, Debit/Withdrawal, Credit/Deposit, Balance)
 * and with free text where each line holds one transaction.
 */
export function readStatement(raw: string): StatementResult {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return { credits: [], skipped: 0 }

  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : lines[0].includes('\t') ? '\t' : ','
  // Find the header row: the first one mentioning a date and an amount column.
  const headerIdx = lines.findIndex((l) => /date/i.test(l) && /(credit|deposit|amount|cr\b)/i.test(l))

  if (headerIdx >= 0) {
    const headers = splitCsvLine(lines[headerIdx], sep).map((h) => h.toLowerCase())
    const iDate = find(headers, /value\s*date/, /txn\s*date/, /^date/, /date/)
    const iText = find(headers, /narration/, /description/, /particulars/, /remarks/, /details/)
    const iRef = find(headers, /ref/, /chq|cheque/, /utr/)
    const iCredit = find(headers, /credit|deposit|cr\s*amount|^cr$/)
    const iDebit = find(headers, /debit|withdrawal|dr\s*amount|^dr$/)
    const iAmount = iCredit < 0 ? find(headers, /amount/) : -1
    const iType = find(headers, /^type$|cr\s*\/\s*dr|dr\s*\/\s*cr/)

    const credits: StatementLine[] = []
    let skipped = 0
    lines.slice(headerIdx + 1).forEach((line, k) => {
      const c = splitCsvLine(line, sep)
      let amount = iCredit >= 0 ? num(c[iCredit]) : iAmount >= 0 ? num(c[iAmount]) : undefined
      if (iAmount >= 0 && iType >= 0 && /^d/i.test(c[iType] ?? '')) amount = undefined // debit row
      if (iDebit >= 0 && num(c[iDebit]) && !(iCredit >= 0 && num(c[iCredit]))) amount = undefined
      const narration = [c[iText], iRef >= 0 ? c[iRef] : ''].filter(Boolean).join(' ')
      if (!amount || amount <= 0 || /opening|closing|total/i.test(narration)) {
        skipped++
        return
      }
      const parsed = parsePaymentText(`${narration} ${c[iDate] ?? ''}`)
      credits.push({
        row: headerIdx + k + 2,
        date: parsed.date,
        narration: c[iText] ?? narration,
        amount,
        reference: (iRef >= 0 && c[iRef]) || parsed.reference,
        method: parsed.method ?? 'BANK_TRANSFER',
      })
    })
    return { credits, skipped }
  }

  // No header: treat each line as one transaction (e.g. copied from a PDF statement or SMS list).
  const credits: StatementLine[] = []
  let skipped = 0
  lines.forEach((line, k) => {
    const p = parsePaymentText(line)
    const isDebit = /\b(dr|debited|withdrawal|paid to|sent to)\b/i.test(line) && !/\b(cr|credited|received)\b/i.test(line)
    if (!p.amount || isDebit) {
      skipped++
      return
    }
    credits.push({ row: k + 1, date: p.date, narration: line.trim(), amount: p.amount, reference: p.reference, method: p.method ?? 'BANK_TRANSFER' })
  })
  return { credits, skipped }
}

export interface StatementMatch {
  line: StatementLine
  match?: InvoiceMatch
  confidence: 'high' | 'medium' | 'none'
}

/**
 * Matches every credit to an invoice. Strongest matches are placed first and
 * each invoice is used once, so two credits can't both claim the same invoice.
 */
export function matchStatement(credits: StatementLine[], unpaid: Invoice[]): StatementMatch[] {
  const candidates = credits.map((line) => {
    const text = `${line.narration} ${line.reference ?? ''}`
    const parsed = { ...parsePaymentText(text), amount: line.amount }
    return { line, options: matchInvoices(parsed, text, unpaid) }
  })
  const order = [...candidates].sort((a, b) => (b.options[0]?.score ?? 0) - (a.options[0]?.score ?? 0))
  const used = new Set<number>()
  const result = new Map<StatementLine, StatementMatch>()
  for (const c of order) {
    const best = c.options.find((o) => !used.has(o.invoice.id) && fits(o, c.line))
    // 35 = a known customer paying part of an invoice; 50+ = exact balance; 100+ = invoice number
    if (best && best.score >= 35) {
      used.add(best.invoice.id)
      result.set(c.line, { line: c.line, match: best, confidence: best.score >= 80 ? 'high' : 'medium' })
    } else {
      result.set(c.line, { line: c.line, confidence: 'none' })
    }
  }
  return credits.map((l) => result.get(l)!)
}

/** A credit can't be more than the invoice's balance. */
function fits(m: InvoiceMatch, line: StatementLine) {
  return line.amount <= m.invoice.total - m.invoice.amountPaid
}
