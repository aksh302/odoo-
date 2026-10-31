import { Tag } from 'antd'
import type { InvoiceStatus, SubscriptionStatus } from '../lib/types'

// Colours from SRS 9.7 "Status badge colours".
const SUBSCRIPTION: Record<SubscriptionStatus, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: 'Draft' },
  QUOTATION: { color: 'blue', label: 'Quotation' },
  CONFIRMED: { color: 'purple', label: 'Confirmed' },
  ACTIVE: { color: 'green', label: 'Active' },
  PAUSED: { color: 'orange', label: 'Paused' },
  CLOSED: { color: '#595959', label: 'Closed' },
  CANCELLED: { color: 'red', label: 'Cancelled' },
}

const INVOICE: Record<InvoiceStatus, { color: string; label: string }> = {
  DRAFT: { color: 'default', label: 'Draft' },
  CONFIRMED: { color: 'purple', label: 'Confirmed' },
  PAID: { color: 'green', label: 'Paid' },
  CANCELLED: { color: 'red', label: 'Cancelled' },
}

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  const s = SUBSCRIPTION[status]
  return <Tag color={s.color}>{s.label}</Tag>
}

/** `overdue` is derived on the server; it adds a red-outline "Overdue" tag. */
export function InvoiceStatusBadge({ status, overdue }: { status: InvoiceStatus; overdue?: boolean }) {
  const s = INVOICE[status]
  return (
    <span className="inline-flex gap-1">
      <Tag color={s.color}>{s.label}</Tag>
      {overdue && (
        <Tag style={{ color: '#cf1322', borderColor: '#cf1322', background: 'transparent' }}>
          Overdue
        </Tag>
      )}
    </span>
  )
}
