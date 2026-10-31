import { api } from './client'
import type { Discount, Invoice, Subscription, Tax, User } from '../lib/types'

// Taxes, discounts, staff and customers (SRS 9.6). Money in paise.

export type DiscountInput = Omit<Discount, 'id' | 'usedCount' | 'isActive'>

export interface CustomerInput {
  name: string
  email: string
  company?: string | null
  phone?: string | null
  billingAddress?: string | null
  taxId?: string | null
}

export interface CustomerDetail {
  customer: User
  subscriptions: Subscription[]
  invoices: Invoice[]
}

export const adminApi = {
  createTax: (input: { name: string; percent: number }) => api.post<{ tax: Tax }>('/taxes', input).then((r) => r.data.tax),
  /** Not in SRS 9.6 yet; agreed extension. */
  updateTax: (id: number, input: { name: string; percent: number }) => api.put<{ tax: Tax }>(`/taxes/${id}`, input).then((r) => r.data.tax),

  createDiscount: (input: DiscountInput) => api.post<{ discount: Discount }>('/discounts', input).then((r) => r.data.discount),
  updateDiscount: (id: number, input: Partial<DiscountInput> & { isActive?: boolean }) =>
    api.put<{ discount: Discount }>(`/discounts/${id}`, input).then((r) => r.data.discount),

  createStaff: (input: { name: string; email: string; password: string }) => api.post<{ user: User }>('/users/staff', input).then((r) => r.data.user),
  setActive: (id: number, isActive: boolean) => api.patch<{ user: User }>(`/users/${id}/active`, { isActive }).then((r) => r.data.user),

  getCustomer: (id: number) => api.get<CustomerDetail>(`/customers/${id}`).then((r) => r.data),
  createCustomer: (input: CustomerInput) => api.post<{ customer: User }>('/customers', input).then((r) => r.data.customer),
  updateCustomer: (id: number, input: Partial<CustomerInput>) => api.put<{ customer: User }>(`/customers/${id}`, input).then((r) => r.data.customer),
}
