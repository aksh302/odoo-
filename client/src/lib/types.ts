// Shapes taken from SRS v1.1 sections 9.2 (Prisma schema) and 9.6 (API contracts).

export type Role = 'ADMIN' | 'STAFF' | 'CUSTOMER'

export type SubscriptionStatus =
  | 'DRAFT'
  | 'QUOTATION'
  | 'CONFIRMED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'CLOSED'
  | 'CANCELLED'

export type InvoiceStatus = 'DRAFT' | 'CONFIRMED' | 'PAID' | 'CANCELLED'

export type BillingPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'CHEQUE' | 'OTHER'

export interface CustomerProfile {
  company?: string | null
  phone?: string | null
  billingAddress?: string | null
  taxId?: string | null
}

export interface User {
  id: number
  name: string
  email: string
  role: Role
  isActive: boolean
  profile?: CustomerProfile | null
}

// ---- Catalog (money fields are integer paise) ----

export interface Tax {
  id: number
  name: string
  percent: number
}

export interface Variant {
  id: number
  productId: number
  attribute: string // e.g. Brand
  value: string // e.g. Odoo
  extraPrice: number // paise, e.g. 56000 = ₹560
  isArchived: boolean
}

export interface Product {
  id: number
  name: string
  type: string
  salesPrice: number
  costPrice: number
  notes?: string | null
  /** GST service code (SAC), printed on invoice lines */
  sacCode?: string | null
  taxId?: number | null
  tax?: Tax | null
  isArchived: boolean
  variants: Variant[]
}

export interface Plan {
  id: number
  name: string
  price: number // paise per period
  billingPeriod: BillingPeriod
  minQty: number
  startDate: string // YYYY-MM-DD
  endDate: string
  autoClose: boolean
  closable: boolean
  pausable: boolean
  renewable: boolean
  isArchived: boolean
}

// ---- Quotation templates & subscriptions ----

export interface TemplateLine {
  id?: number
  productId: number
  variantId?: number | null
  quantity: number
  product?: Pick<Product, 'id' | 'name' | 'salesPrice'>
  variant?: Pick<Variant, 'id' | 'value' | 'extraPrice'> | null
}

export interface QuotationTemplate {
  id: number
  name: string
  planId: number
  plan?: Pick<Plan, 'id' | 'name' | 'price' | 'billingPeriod' | 'minQty'>
  validityDays: number
  lines: TemplateLine[]
}

export interface SubscriptionLine {
  id: number
  productId: number
  variantId?: number | null
  description: string // snapshot: product name + variant
  sacCode?: string | null
  quantity: number
  unitPrice: number // paise snapshot = salesPrice + extraPrice
  taxId?: number | null
  tax?: Tax | null
  amount: number // quantity * unitPrice
}

export interface Subscription {
  id: number
  number: string // SUB-2026-000001
  customerId: number
  customer?: Pick<User, 'id' | 'name' | 'email'> & { company?: string | null }
  planId: number
  plan?: Plan
  status: SubscriptionStatus
  quotationDate?: string | null
  validUntil?: string | null
  startDate: string
  expiryDate: string
  paymentTerms: number // days
  anchorDay?: number | null
  nextBillingDate?: string | null
  closedAt?: string | null
  createdAt?: string
  /** list endpoint convenience: plan fee + line amounts, pre-tax */
  recurringAmount?: number
}

/** Short invoice row shown on a subscription's detail page. */
export interface InvoiceSummary {
  id: number
  number: string
  periodStart: string
  periodEnd: string
  dueDate: string
  total: number
  amountPaid: number
  status: InvoiceStatus
  overdue?: boolean
}

// ---- Invoices, payments, billing runs ----

export interface InvoiceLine {
  id: number
  productId?: number | null // null for the plan-fee line
  description: string
  sacCode?: string | null
  quantity: number
  unitPrice: number
  amount: number
  discountId?: number | null
  discountName?: string | null
  discountAmount: number
  taxPercent: number
  taxAmount: number
}

export interface Reminder {
  at: string
  channel: 'EMAIL' | 'WHATSAPP'
  by?: string | null
}

export interface CustomerSnapshot {
  name: string
  email?: string
  phone?: string | null
  company?: string | null
  billingAddress?: string | null
  taxId?: string | null
}

export interface Invoice {
  id: number
  number: string // INV-2026-000001
  subscriptionId: number
  subscriptionNumber?: string
  customerId: number
  customerSnapshot: CustomerSnapshot
  periodStart: string
  periodEnd: string
  dueDate: string
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  amountPaid: number
  status: InvoiceStatus
  overdue?: boolean // derived by the server
  emailedAt?: string | null
  /** payment reminders sent so far, newest first */
  reminders?: Reminder[]
  createdAt: string
}

export interface Payment {
  id: number
  invoiceId: number
  invoiceNumber?: string
  customerName?: string
  method: PaymentMethod
  amount: number
  date: string
  reference?: string | null
  note?: string | null
  voidedAt?: string | null
  voidReason?: string | null
  createdAt?: string
}

export interface BillingRun {
  id: number
  startedAt: string
  finishedAt?: string | null
  triggeredBy: string
  asOf: string
  created: number
  skipped: number
  failed: number
  errorLog?: { subscriptionNumber: string; message: string }[] | null
}

// ---- Admin: discounts, audit ----

export interface Discount {
  id: number
  name: string
  type: 'FIXED' | 'PERCENT'
  value: number // paise if FIXED, whole percent 0-100 if PERCENT
  scope: 'PRODUCT' | 'SUBSCRIPTION'
  productIds: number[]
  minQty?: number | null
  minPurchase?: number | null // paise
  startDate: string
  endDate: string
  usageLimit?: number | null
  usedCount: number // read only
  isActive: boolean
}

export interface AuditEntry {
  id: number
  at: string
  userId?: number | null
  userName?: string | null
  action: string // e.g. SUBSCRIPTION_STATUS, PAYMENT_CREATE
  entity: string // e.g. Subscription, Invoice, Payment
  entityId: number
  entityLabel?: string | null // e.g. SUB-2026-000004
  oldValue?: unknown
  newValue?: unknown
}

/** Every list endpoint returns this. */
export interface Paged<T> {
  data: T[]
  page: number
  limit: number
  total: number
}

/** Every error response: { error: { code, message, fields? } } */
export interface ApiErrorBody {
  error: {
    code: string
    message: string
    fields?: Record<string, string>
  }
}
