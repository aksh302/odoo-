import { api } from './client'
import type { Paged, Plan, Product, Tax, Variant } from '../lib/types'

// SRS 9.6 "Catalog, plans, templates". All money in paise.

export type ProductInput = Pick<Product, 'name' | 'type' | 'salesPrice' | 'costPrice'> & {
  notes?: string | null
  taxId?: number | null
}
export type VariantInput = Pick<Variant, 'productId' | 'attribute' | 'value' | 'extraPrice'>
export type PlanInput = Omit<Plan, 'id' | 'isArchived'>

export const catalogApi = {
  createProduct: (input: ProductInput) =>
    api.post<{ product: Product }>('/products', input).then((r) => r.data.product),
  updateProduct: (id: number, input: Partial<ProductInput> & { isArchived?: boolean }) =>
    api.put<{ product: Product }>(`/products/${id}`, input).then((r) => r.data.product),

  createVariant: (input: VariantInput) =>
    api.post<{ variant: Variant }>('/variants', input).then((r) => r.data.variant),
  updateVariant: (id: number, input: { extraPrice?: number; isArchived?: boolean }) =>
    api.put<{ variant: Variant }>(`/variants/${id}`, input).then((r) => r.data.variant),

  createPlan: (input: PlanInput) => api.post<{ plan: Plan }>('/plans', input).then((r) => r.data.plan),
  updatePlan: (id: number, input: Partial<PlanInput> & { isArchived?: boolean }) =>
    api.put<{ plan: Plan }>(`/plans/${id}`, input).then((r) => r.data.plan),

  listTaxes: () => api.get<Paged<Tax>>('/taxes', { params: { limit: 100 } }).then((r) => r.data.data),
}
