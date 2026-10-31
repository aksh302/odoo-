import { api, USE_MOCKS } from './client'
import type { InvoiceDetail } from './billing'
import type { LineInput } from './subscriptions'
import type { Subscription, SubscriptionStatus } from '../lib/types'

// Customer portal endpoints (SRS 9.6). The server filters everything by the logged-in customer.

export const portalApi = {
  changeStatus: (id: number, body: { status: SubscriptionStatus } | { action: 'renew' }) =>
    api.patch<{ subscription: Subscription }>(`/portal/subscriptions/${id}/status`, body).then((r) => r.data.subscription),

  /** Creates a QUOTATION for staff to confirm. */
  requestPlan: (planId: number, lines: LineInput[]) =>
    api
      .post<{ subscription: Subscription }>('/portal/subscriptions', {
        planId,
        quantity: lines.reduce((a, l) => a + l.quantity, 0),
        lines,
      })
      .then((r) => r.data.subscription),

  /** Not in SRS 9.6 yet; used by the printable view. */
  getInvoice: (id: number) => api.get<InvoiceDetail>(`/portal/invoices/${id}`).then((r) => r.data),

  openPdf: async (id: number) => {
    if (USE_MOCKS) {
      window.open(`/portal/invoices/${id}/print`, '_blank')
      return
    }
    const res = await api.get(`/portal/invoices/${id}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
}
