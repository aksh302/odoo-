import { api, USE_MOCKS } from './client'
import type { Invoice, InvoiceLine, Payment, PaymentMethod } from '../lib/types'

// SRS 9.6 "Billing, invoices" and "Payments". Money in paise.

export interface InvoiceDetail {
  invoice: Invoice
  lines: InvoiceLine[]
  payments: Payment[]
}

export interface RunResult {
  runId: number
  created: number
  skipped: number
  failed: number
}

export interface PaymentInput {
  invoiceId: number
  method: PaymentMethod
  amount: number
  date: string
  reference?: string
  note?: string
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
]
export const methodLabel = (m: PaymentMethod) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m

export const billingApi = {
  run: (asOf?: string) => api.post<RunResult>('/billing/run', asOf ? { asOf } : {}).then((r) => r.data),

  getInvoice: (id: number) => api.get<InvoiceDetail>(`/invoices/${id}`).then((r) => r.data),
  setInvoiceStatus: (id: number, status: 'CONFIRMED' | 'CANCELLED') =>
    api.patch<{ invoice: Invoice }>(`/invoices/${id}/status`, { status }).then((r) => r.data.invoice),
  confirmDrafts: (ids?: number[]) =>
    api.post<{ confirmed: number }>('/invoices/confirm-drafts', ids ? { ids } : {}).then((r) => r.data.confirmed),
  sendInvoice: (id: number) => api.post<{ emailedAt: string }>(`/invoices/${id}/send`).then((r) => r.data.emailedAt),

  /**
   * Opens the invoice PDF from GET /invoices/:id/pdf in a new tab.
   * In mock mode there is no PDF server, so the printable page opens instead.
   */
  openPdf: async (id: number) => {
    if (USE_MOCKS) {
      window.open(`/invoices/${id}/print`, '_blank')
      return
    }
    const res = await api.get(`/invoices/${id}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },

  recordPayment: (input: PaymentInput) =>
    api.post<{ payment: Payment; invoice: Invoice }>('/payments', input).then((r) => r.data),
  voidPayment: (id: number, reason: string) =>
    api.post<{ invoice: Invoice }>(`/payments/${id}/void`, { reason }).then((r) => r.data.invoice),
}
