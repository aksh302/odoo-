import { SearchOutlined } from '@ant-design/icons'
import { Alert, Card, Input, Select, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePagedList } from '../../hooks/usePagedList'
import type { AuditEntry } from '../../lib/types'

// Plain-English names for audit actions (NFR-12).
const ACTION: Record<string, string> = {
  SUBSCRIPTION_CREATE: 'Created subscription',
  SUBSCRIPTION_STATUS: 'Changed subscription status',
  SUBSCRIPTION_RENEW: 'Renewed subscription',
  INVOICE_STATUS: 'Changed invoice status',
  PAYMENT_CREATE: 'Recorded payment',
  PAYMENT_VOID: 'Voided payment',
  BILLING_RUN: 'Ran billing',
  DISCOUNT_CREATE: 'Created discount',
  DISCOUNT_UPDATE: 'Edited discount',
  DISCOUNT_DEACTIVATE: 'Turned off discount',
  TAX_CREATE: 'Created tax',
  TAX_UPDATE: 'Edited tax',
  STAFF_CREATE: 'Added staff member',
  USER_DEACTIVATE: 'Deactivated user',
  USER_REACTIVATE: 'Reactivated user',
  CUSTOMER_CREATE: 'Added customer',
  CUSTOMER_UPDATE: 'Edited customer',
}

const ENTITIES = ['Subscription', 'Invoice', 'BillingRun', 'Discount', 'Tax', 'User']

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

/** Short "what changed" text, e.g. "Draft → Quotation" or "₹500.00 by UPI". */
function changeText(a: AuditEntry): string {
  const o = (a.oldValue ?? {}) as Record<string, unknown>
  const n = (a.newValue ?? {}) as Record<string, unknown>
  if ('status' in n && 'status' in o) return `${titleCase(String(o.status))} → ${titleCase(String(n.status))}`
  if (a.action === 'SUBSCRIPTION_RENEW') return `Ends ${dayjs(String(o.expiryDate)).format('D MMM YYYY')} → ${dayjs(String(n.expiryDate)).format('D MMM YYYY')}`
  if (a.action === 'PAYMENT_CREATE') return `₹${(Number(n.amount) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })} by ${String(n.method).replace('_', ' ').toLowerCase()}`
  if (a.action === 'PAYMENT_VOID') return `Reason: ${String(n.reason)}`
  if (a.action === 'BILLING_RUN') return `${n.created} created, ${n.skipped} skipped, ${n.failed} failed`
  if ('isActive' in n) return n.isActive ? 'Can log in' : 'Can’t log in'
  if ('percent' in n) return `${n.percent}%`
  return ''
}

/** SRS 9.7 /audit — who changed what, newest first. Admin and Staff (read only). */
export default function AuditPage() {
  const navigate = useNavigate()
  const [entity, setEntity] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const list = usePagedList<AuditEntry>('/audit', { entity, q: search })

  const open = (a: AuditEntry) => {
    if (a.entity === 'Subscription') navigate(`/subscriptions/${a.entityId}`)
    else if (a.entity === 'Invoice') navigate(`/invoices/${a.entityId}`)
    else if (a.entity === 'BillingRun') navigate('/billing')
  }
  const linkable = (a: AuditEntry) => ['Subscription', 'Invoice', 'BillingRun'].includes(a.entity)

  const columns: ColumnsType<AuditEntry> = [
    { title: 'When', render: (_, a) => <span className="whitespace-nowrap">{dayjs(a.at).format('D MMM YYYY, h:mm a')}</span> },
    { title: 'Who', render: (_, a) => a.userName ?? 'System' },
    { title: 'Action', render: (_, a) => ACTION[a.action] ?? a.action },
    {
      title: 'Record',
      render: (_, a) =>
        linkable(a) ? <Typography.Link onClick={() => open(a)}>{a.entityLabel}</Typography.Link> : a.entityLabel,
    },
    { title: 'Change', render: (_, a) => <Typography.Text type="secondary">{changeText(a)}</Typography.Text> },
  ]

  return (
    <>
      <Typography.Title level={3} className="mb-4">
        Audit log
      </Typography.Title>
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <Select
            allowClear
            placeholder="Everything"
            style={{ width: 180 }}
            value={entity}
            onChange={setEntity}
            options={ENTITIES.map((e) => ({ value: e, label: e === 'BillingRun' ? 'Billing runs' : e === 'User' ? 'Users' : `${e}s` }))}
          />
          <Input
            className="max-w-xs"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Record, person or action"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {list.error && <Alert className="mb-4" type="error" showIcon title={list.error} />}
        <Table<AuditEntry> {...list.tableProps} columns={columns} scroll={{ x: 800 }} locale={{ emptyText: 'Nothing recorded yet.' }} />
      </Card>
    </>
  )
}
