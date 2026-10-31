import type { Plan, Product, Tax, Variant } from '../../lib/types'
import { contains, fail, nextId, paginate, requireRole, todayISO } from './util'
import type { MockCtx, MockRoutes } from './util'

// ---------- seed data ----------

export const taxes: Tax[] = [
  { id: 1, name: 'GST 18%', percent: 18 },
  { id: 2, name: 'GST 12%', percent: 12 },
  { id: 3, name: 'GST 5%', percent: 5 },
]

let variants: Variant[] = [
  { id: 1, productId: 1, attribute: 'Brand', value: 'Odoo', extraPrice: 56000, isArchived: false },
  { id: 2, productId: 1, attribute: 'Brand', value: 'Zoho', extraPrice: 32000, isArchived: false },
  { id: 3, productId: 2, attribute: 'Edition', value: 'Pro', extraPrice: 150000, isArchived: false },
]

export const products: Omit<Product, 'variants' | 'tax'>[] = [
  { id: 1, name: 'Brightloop ERP', type: 'Service', salesPrice: 249900, costPrice: 90000, notes: 'Core ERP seat', taxId: 1, isArchived: false },
  { id: 2, name: 'Brightloop CRM', type: 'Service', salesPrice: 149900, costPrice: 50000, notes: null, taxId: 1, isArchived: false },
  { id: 3, name: 'Analytics Add-on', type: 'Add-on', salesPrice: 49900, costPrice: 10000, notes: 'Switch on/off any time', taxId: 1, isArchived: false },
  { id: 4, name: 'Priority Support', type: 'Add-on', salesPrice: 99900, costPrice: 40000, notes: null, taxId: 2, isArchived: false },
  { id: 5, name: 'Onboarding Pack', type: 'Service', salesPrice: 500000, costPrice: 200000, notes: 'Legacy', taxId: 1, isArchived: true },
]

const year = new Date().getFullYear()
export const plans: Plan[] = [
  { id: 1, name: 'Starter Monthly', price: 99900, billingPeriod: 'MONTHLY', minQty: 1, startDate: `${year}-01-01`, endDate: `${year + 1}-12-31`, autoClose: false, closable: true, pausable: true, renewable: true, isArchived: false },
  { id: 2, name: 'Business Yearly', price: 999900, billingPeriod: 'YEARLY', minQty: 5, startDate: `${year}-01-01`, endDate: `${year + 2}-12-31`, autoClose: false, closable: false, pausable: false, renewable: true, isArchived: false },
  { id: 3, name: 'Weekly Trial', price: 19900, billingPeriod: 'WEEKLY', minQty: 1, startDate: `${year}-06-01`, endDate: `${year}-12-31`, autoClose: true, closable: true, pausable: false, renewable: false, isArchived: false },
  { id: 4, name: 'Daily Pass', price: 4900, billingPeriod: 'DAILY', minQty: 1, startDate: `${year + 1}-01-01`, endDate: `${year + 1}-06-30`, autoClose: true, closable: true, pausable: true, renewable: false, isArchived: false },
  { id: 5, name: 'Legacy Monthly', price: 79900, billingPeriod: 'MONTHLY', minQty: 1, startDate: `${year - 2}-01-01`, endDate: `${year - 1}-12-31`, autoClose: true, closable: true, pausable: true, renewable: true, isArchived: true },
]

// ---------- helpers ----------

export const getVariants = () => variants

const withJoins = (p: Omit<Product, 'variants' | 'tax'>): Product => ({
  ...p,
  tax: taxes.find((t) => t.id === p.taxId) ?? null,
  variants: variants.filter((v) => v.productId === p.id),
})

const adminOnly = (ctx: MockCtx) => requireRole(ctx, 'ADMIN')
const backOffice = (ctx: MockCtx) => requireRole(ctx, 'ADMIN', 'STAFF')

function validateProduct(b: any) {
  const fields: Record<string, string> = {}
  if (b.name !== undefined && !String(b.name).trim()) fields.name = 'Name is required'
  if (b.salesPrice !== undefined && b.salesPrice < 0) fields.salesPrice = 'Must be 0 or more'
  if (b.costPrice !== undefined && b.costPrice < 0) fields.costPrice = 'Must be 0 or more'
  return Object.keys(fields).length ? fail(400, 'VALIDATION_ERROR', 'Invalid product', fields) : null
}

function validatePlan(b: Partial<Plan>) {
  const fields: Record<string, string> = {}
  if (b.price !== undefined && b.price < 0) fields.price = 'Must be 0 or more'
  if (b.minQty !== undefined && b.minQty < 1) fields.minQty = 'Must be at least 1'
  if (b.startDate && b.endDate && b.endDate <= b.startDate) fields.endDate = 'End date must be after start date'
  return Object.keys(fields).length ? fail(400, 'VALIDATION_ERROR', 'Invalid plan', fields) : null
}

// ---------- routes ----------

export const catalogRoutes: MockRoutes = {
  'GET /taxes': (ctx) => backOffice(ctx) ?? paginate(taxes, { ...ctx.query, limit: 100 }),

  'GET /products': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const { q = '', archived } = ctx.query
    const all = products
      .filter((p) => contains(p.name, q) || contains(p.type, q))
      .filter((p) => (archived === 'true' || archived === true ? true : !p.isArchived))
      .map(withJoins)
    return paginate(all, ctx.query)
  },

  'POST /products': (ctx) => {
    const denied = adminOnly(ctx) ?? validateProduct(ctx.body)
    if (denied) return denied
    const p = { id: nextId(), notes: null, taxId: null, isArchived: false, ...ctx.body }
    products.unshift(p)
    return [201, { product: withJoins(p) }]
  },

  'PUT /products/:id': (ctx) => {
    const denied = adminOnly(ctx) ?? validateProduct(ctx.body)
    if (denied) return denied
    const p = products.find((x) => x.id === Number(ctx.params.id))
    if (!p) return fail(404, 'NOT_FOUND', 'Product not found')
    Object.assign(p, ctx.body, { id: p.id })
    return [200, { product: withJoins(p) }]
  },

  'POST /variants': (ctx) => {
    const denied = adminOnly(ctx)
    if (denied) return denied
    const { productId, attribute, value, extraPrice } = ctx.body
    const dup = variants.some(
      (v) => v.productId === productId && v.attribute.toLowerCase() === String(attribute).toLowerCase() && v.value.toLowerCase() === String(value).toLowerCase(),
    )
    if (dup) return fail(409, 'VALIDATION_ERROR', 'Variant exists', { value: 'This variant already exists' })
    if (extraPrice < 0) return fail(400, 'VALIDATION_ERROR', 'Invalid', { extraPrice: 'Must be 0 or more' })
    const v: Variant = { id: nextId(), productId, attribute, value, extraPrice, isArchived: false }
    variants = [...variants, v]
    return [201, { variant: v }]
  },

  'PUT /variants/:id': (ctx) => {
    const denied = adminOnly(ctx)
    if (denied) return denied
    const v = variants.find((x) => x.id === Number(ctx.params.id))
    if (!v) return fail(404, 'NOT_FOUND', 'Variant not found')
    if (ctx.body.extraPrice !== undefined) v.extraPrice = ctx.body.extraPrice
    if (ctx.body.isArchived !== undefined) v.isArchived = ctx.body.isArchived
    return [200, { variant: v }]
  },

  'GET /plans': (ctx) => {
    const denied = backOffice(ctx)
    if (denied) return denied
    const { q = '', available, archived, billingPeriod } = ctx.query
    const today = todayISO()
    const all = plans
      .filter((p) => contains(p.name, q))
      .filter((p) => (billingPeriod ? p.billingPeriod === billingPeriod : true))
      .filter((p) => (archived === 'true' || archived === true ? true : !p.isArchived))
      .filter((p) => (available === 'true' || available === true ? p.startDate <= today && today <= p.endDate && !p.isArchived : true))
    return paginate(all, ctx.query)
  },

  'POST /plans': (ctx) => {
    const denied = adminOnly(ctx) ?? validatePlan(ctx.body)
    if (denied) return denied
    const p: Plan = { id: nextId(), isArchived: false, ...ctx.body }
    plans.unshift(p)
    return [201, { plan: p }]
  },

  'PUT /plans/:id': (ctx) => {
    const p = plans.find((x) => x.id === Number(ctx.params.id))
    if (!p) return fail(404, 'NOT_FOUND', 'Plan not found')
    const denied = adminOnly(ctx) ?? validatePlan({ ...p, ...ctx.body })
    if (denied) return denied
    Object.assign(p, ctx.body, { id: p.id })
    return [200, { plan: p }]
  },
}
