// Per-invoice estimate shown while building a subscription, using SRS 9.4 rules.
// Discounts are left out: they are decided by the billing run on the day.

export interface EstimateLine {
  quantity: number
  unitPrice: number // paise
  taxPercent?: number | null
}

export interface Estimate {
  planFee: number
  productsSubtotal: number
  tax: number
  total: number
}

/** Tax on a line: floor((net × percentBp + 5000) / 10000), integer paise. */
export function lineTax(amount: number, percent?: number | null): number {
  if (!percent) return 0
  const bp = Math.round(percent * 100)
  return Math.floor((amount * bp + 5000) / 10000)
}

export function estimateInvoice(planPrice: number, lines: EstimateLine[]): Estimate {
  let productsSubtotal = 0
  let tax = 0
  for (const l of lines) {
    const amount = (l.quantity || 0) * (l.unitPrice || 0)
    productsSubtotal += amount
    tax += lineTax(amount, l.taxPercent)
  }
  // Plan fee: its own line, quantity 1, no tax.
  return { planFee: planPrice, productsSubtotal, tax, total: planPrice + productsSubtotal + tax }
}
