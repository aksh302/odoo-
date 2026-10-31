import { api } from './client'

// GET /reports/summary and /reports/export.csv (SRS 9.6). Money in paise.

export interface ReportFilters {
  from?: string // payment date range for "collected"
  to?: string
  customerId?: number
  planId?: number
}

export interface Summary {
  activeSubscriptions: number
  mrr: number
  arr: number
  revenueCollected: number
  outstanding: number
  overdueCount: number
  overdueAmount: number
  aging: { d0_30: number; d31_60: number; d60plus: number }
  counts: { paid: number; outstanding: number; overdue: number }
  revenueByMonth: { month: string; collected: number }[]
}

const clean = (f: ReportFilters) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ''))

export const reportsApi = {
  summary: (f: ReportFilters) => api.get<Summary>('/reports/summary', { params: clean(f) }).then((r) => r.data),

  /** Downloads the filtered summary as a CSV file. */
  exportCsv: async (f: ReportFilters) => {
    const res = await api.get('/reports/export.csv', { params: clean(f), responseType: 'blob' })
    const blob = res.data instanceof Blob ? res.data : new Blob([String(res.data)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `brightloop-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  },
}
