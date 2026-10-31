import { api } from './client'
import type { InvoiceSummary, QuotationTemplate, Subscription, SubscriptionLine, SubscriptionStatus } from '../lib/types'

// SRS 9.6 "Subscriptions" and templates. Money in paise.

export interface LineInput {
  productId: number
  variantId?: number | null
  quantity: number
}

export interface SubscriptionInput {
  customerId: number
  planId: number
  startDate: string
  expiryDate: string
  paymentTerms?: number
  templateId?: number
  lines: LineInput[]
}

export interface TemplateInput {
  name: string
  planId: number
  validityDays: number
  lines: LineInput[]
}

export interface SubscriptionDetail {
  subscription: Subscription
  lines: SubscriptionLine[]
  invoices: InvoiceSummary[]
}

export const subscriptionsApi = {
  get: (id: number) => api.get<SubscriptionDetail>(`/subscriptions/${id}`).then((r) => r.data),
  create: (input: SubscriptionInput) =>
    api.post<{ subscription: Subscription }>('/subscriptions', input).then((r) => r.data.subscription),
  update: (id: number, input: SubscriptionInput) =>
    api.put<{ subscription: Subscription }>(`/subscriptions/${id}`, input).then((r) => r.data.subscription),
  changeStatus: (id: number, body: { status: SubscriptionStatus } | { action: 'renew' }) =>
    api.patch<{ subscription: Subscription }>(`/subscriptions/${id}/status`, body).then((r) => r.data.subscription),

  createTemplate: (input: TemplateInput) =>
    api.post<{ template: QuotationTemplate }>('/templates', input).then((r) => r.data.template),
  /** Not in SRS 9.6 yet; agreed extension (same body as POST). */
  updateTemplate: (id: number, input: TemplateInput) =>
    api.put<{ template: QuotationTemplate }>(`/templates/${id}`, input).then((r) => r.data.template),
}
