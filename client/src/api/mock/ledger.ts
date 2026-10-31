import dayjs from 'dayjs'
import { addPeriods } from '../../lib/cycle'
import type { BillingRun, CustomerSnapshot, Invoice, InvoiceLine, Payment, Plan, SubscriptionLine } from '../../lib/types'
import { nextId, todayISO } from './util'

/**
 * Mock store for invoices, payments, billing runs and discounts,
 * plus the invoice calculation from SRS 9.4. Used by subscriptions.ts (seed)
 * and billing.ts (routes + billing run).
 */

export interface InvoiceRecord extends Invoice {
  lines: InvoiceLine[]
  payments: Payment[]
}

export const invoices: InvoiceRecord[] = []
export const runs: BillingRun[] = []

let invSeq = 400
export const nextInvoiceNumber = (on: string) => `INV-${dayjs(on).year()}-${String(++invSeq).padStart(6, '0')}`

/** After seeding: number invoices in date order, like a real database sequence would. */
export function renumberSeeded() {
  invSeq = 400
  invoices.sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.id - b.id)
  invoices.forEach((i) => (i.number = nextInvoiceNumber(i.periodStart)))
}

// ---------- discounts (admin screen comes later; seeded here) ----------

export interface MockDiscount {
  id: number
  name: string
  type: 'FIXED' | 'PERCENT'
  value: number // paise if FIXED, whole percent if PERCENT
  scope: 'PRODUCT' | 'SUBSCRIPTION'
  productIds: number[]
  minQty?: number
  minPurchase?: number
  startDate: string
  endDate: string
  usageLimit?: number
  usedCount: number
  isActive: boolean
}

const y = dayjs().year()
export const discounts: MockDiscount[] = [
  { id: 1, name: 'Volume seats 10%', type: 'PERCENT', value: 10, scope: 'PRODUCT', productIds: [1, 2], minQty: 5, startDate: `${y}-01-01`, endDate: `${y + 1}-12-31`, usageLimit: 200, usedCount: 12, isActive: true },
  { id: 2, name: 'Festive ₹500 off', type: 'FIXED', value: 50000, scope: 'SUBSCRIPTION', productIds: [], minPurchase: 400000, startDate: `${y}-10-01`, endDate: `${y}-12-31`, usageLimit: 25, usedCount: 3, isActive: true },
]

// ---------- calculation (SRS 9.4) ----------

const taxOn = (net: number, percent: number) => Math.floor((net * Math.round(percent * 100) + 5000) / 10000)

/** Builds one invoice for a period. Claims discount usage atomically (here: synchronously). */
export function buildInvoice(args: {
  subscriptionId: number
  subscriptionNumber: string
  customerId: number
  customer: CustomerSnapshot
  plan: Plan
  lines: SubscriptionLine[]
  periodStart: string
  anchorDay?: number | null
  paymentTerms: number
  claimDiscounts?: boolean
}): InvoiceRecord {
  const { plan, periodStart } = args
  const periodEnd = dayjs(addPeriods(periodStart, plan.billingPeriod, 1, args.anchorDay)).subtract(1, 'day').format('YYYY-MM-DD')

  const lines: InvoiceLine[] = [
    // Plan fee: its own line, quantity 1, no tax
    { id: nextId(), productId: null, description: `Plan fee - ${plan.name}`, quantity: 1, unitPrice: plan.price, amount: plan.price, discountAmount: 0, taxPercent: 0, taxAmount: 0 },
    ...args.lines.map((l) => ({
      id: nextId(),
      productId: l.productId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.amount,
      discountAmount: 0,
      taxPercent: l.tax?.percent ?? 0,
      taxAmount: 0,
    })),
  ]

  // Discounts: candidates valid on the period start with usage left. One per line, highest wins.
  const candidates = discounts.filter(
    (d) => d.isActive && d.startDate <= periodStart && periodStart <= d.endDate && (d.usageLimit == null || d.usedCount < d.usageLimit),
  )
  const subtotal = lines.reduce((a, l) => a + l.amount, 0)
  const totalQty = args.lines.reduce((a, l) => a + l.quantity, 0)
  const best = new Map<number, { d: MockDiscount; amount: number }>()

  for (const d of candidates) {
    if (d.scope === 'PRODUCT') {
      for (const l of lines) {
        if (!l.productId || !d.productIds.includes(l.productId)) continue
        if (d.minQty && l.quantity < d.minQty) continue
        if (d.minPurchase && l.amount < d.minPurchase) continue
        const amt = d.type === 'PERCENT' ? Math.floor((l.amount * d.value + 50) / 100) : Math.min(d.value, l.amount)
        if (amt > (best.get(l.id)?.amount ?? 0)) best.set(l.id, { d, amount: amt })
      }
    } else {
      if (d.minPurchase && subtotal < d.minPurchase) continue
      if (d.minQty && totalQty < d.minQty) continue
      const pool = d.type === 'PERCENT' ? Math.floor((subtotal * d.value + 50) / 100) : Math.min(d.value, subtotal)
      let left = pool
      lines.forEach((l, i) => {
        const share = i === lines.length - 1 ? left : Math.floor((pool * l.amount) / Math.max(1, subtotal))
        left -= share
        if (share > (best.get(l.id)?.amount ?? 0)) best.set(l.id, { d, amount: Math.min(share, l.amount) })
      })
    }
  }

  const used = new Set<MockDiscount>()
  for (const l of lines) {
    const b = best.get(l.id)
    if (b) {
      l.discountId = b.d.id
      l.discountName = b.d.name
      l.discountAmount = b.amount
      used.add(b.d)
    }
    l.taxAmount = taxOn(l.amount - l.discountAmount, l.taxPercent)
  }
  if (args.claimDiscounts !== false) used.forEach((d) => (d.usedCount += 1))

  const discountTotal = lines.reduce((a, l) => a + l.discountAmount, 0)
  const taxTotal = lines.reduce((a, l) => a + l.taxAmount, 0)
  return {
    id: nextId(),
    number: nextInvoiceNumber(periodStart),
    subscriptionId: args.subscriptionId,
    subscriptionNumber: args.subscriptionNumber,
    customerId: args.customerId,
    customerSnapshot: args.customer,
    periodStart,
    periodEnd,
    dueDate: dayjs(periodStart).add(args.paymentTerms, 'day').format('YYYY-MM-DD'),
    subtotal,
    discountTotal,
    taxTotal,
    total: subtotal - discountTotal + taxTotal,
    amountPaid: 0,
    status: 'CONFIRMED', // auto-confirm on creation (FR-6.13, default on)
    emailedAt: null,
    createdAt: new Date(periodStart).toISOString(),
    lines,
    payments: [],
  }
}

export const isOverdue = (i: Invoice) => i.status === 'CONFIRMED' && i.dueDate < todayISO() && i.amountPaid < i.total

/** Records a payment that covers `amount` and marks the invoice paid if fully covered. */
export function applyPayment(inv: InvoiceRecord, p: Omit<Payment, 'id' | 'invoiceId'>): Payment {
  const payment: Payment = { id: nextId(), invoiceId: inv.id, createdAt: new Date().toISOString(), ...p }
  inv.payments.push(payment)
  inv.amountPaid += p.amount
  if (inv.amountPaid >= inv.total) inv.status = 'PAID'
  return payment
}
