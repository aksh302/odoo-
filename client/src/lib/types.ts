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
