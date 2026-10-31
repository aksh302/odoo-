import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Input, Segmented, Select, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CycleRing } from '../components/CycleRing'
import { SubscriptionStatusBadge } from '../components/StatusBadge'
import { useCatalog } from '../hooks/useCatalog'
import { usePagedList } from '../hooks/usePagedList'
import { cycleInfo } from '../lib/cycle'
import { PERIOD_WORD } from '../lib/labels'
import { formatINR } from '../lib/money'
import type { Subscription, SubscriptionStatus } from '../lib/types'

const STATUSES: { value: SubscriptionStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'QUOTATION', label: 'Quotation' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

const fmt = (d: string) => dayjs(d).format('D MMM YYYY')

/** Next invoice cell: the cycle ring for billed subscriptions, plain words otherwise. */
export function NextInvoice({ sub }: { sub: Subscription }) {
  const info = cycleInfo(sub, sub.plan)
  if (sub.status === 'PAUSED') {
    return <Typography.Text type="secondary">Paused, not billing</Typography.Text>
  }
  if (info) {
    const when = info.daysLeft === 0 ? 'Today' : info.daysLeft === 1 ? 'Tomorrow' : `In ${info.daysLeft} days`
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <CycleRing progress={info.progress} dueSoon={info.dueSoon} title={`Next invoice ${fmt(info.nextDate)}`} />
        <span>
          <span style={info.dueSoon ? { color: '#A86A0F', fontWeight: 600 } : undefined}>{when}</span>
          <Typography.Text type="secondary" className="block text-xs">
            {fmt(info.nextDate)}
          </Typography.Text>
        </span>
      </span>
    )
  }
  if (sub.status === 'CONFIRMED') return <Typography.Text type="secondary">Starts {fmt(sub.startDate)}</Typography.Text>
  return <Typography.Text type="secondary">—</Typography.Text>
}

/** SRS 9.7 /subscriptions — filterable list with status badges. */
export default function SubscriptionsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<SubscriptionStatus | 'ALL'>('ALL')
  const [planId, setPlanId] = useState<number | undefined>()
  const { plans } = useCatalog({ availableOnly: false })
  const list = usePagedList<Subscription>('/subscriptions', {
    q: search,
    status: status === 'ALL' ? undefined : status,
    planId,
  })

  const columns: ColumnsType<Subscription> = [
    {
      title: 'Subscription',
      render: (_, s) => <Typography.Link onClick={() => navigate(`/subscriptions/${s.id}`)}>{s.number}</Typography.Link>,
    },
    {
      title: 'Customer',
      render: (_, s) => (
        <span>
          {s.customer?.name}
          {s.customer?.company && (
            <Typography.Text type="secondary" className="block text-xs">
              {s.customer.company}
            </Typography.Text>
          )}
        </span>
      ),
    },
    {
      title: 'Plan',
      render: (_, s) => s.plan?.name,
    },
    { title: 'Status', render: (_, s) => <SubscriptionStatusBadge status={s.status} /> },
    { title: 'Next invoice', render: (_, s) => <NextInvoice sub={s} /> },
    {
      title: 'Recurring',
      align: 'right',
      render: (_, s) => (
        <span className="whitespace-nowrap">
          {formatINR(s.recurringAmount)}
          {s.plan && <Typography.Text type="secondary"> / {PERIOD_WORD[s.plan.billingPeriod]}</Typography.Text>}
        </span>
      ),
    },
    { title: 'Expires', render: (_, s) => <span className="whitespace-nowrap">{fmt(s.expiryDate)}</span> },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Typography.Title level={3}>Subscriptions</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/subscriptions/new')}>
          New subscription
        </Button>
      </div>
      <Card>
        <div className="mb-4 overflow-x-auto">
          <Segmented options={STATUSES} value={status} onChange={(v) => setStatus(v as SubscriptionStatus | 'ALL')} />
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            className="max-w-xs"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Number, customer or company"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            allowClear
            placeholder="Any plan"
            style={{ width: 200 }}
            value={planId}
            onChange={setPlanId}
            options={plans.map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>
        {list.error && <Alert className="mb-4" type="error" showIcon title={list.error} />}
        <Table<Subscription>
          {...list.tableProps}
          columns={columns}
          scroll={{ x: 1000 }}
          onRow={(s) => ({ onClick: () => navigate(`/subscriptions/${s.id}`), style: { cursor: 'pointer' } })}
          locale={{ emptyText: 'No subscriptions match these filters.' }}
        />
      </Card>
    </>
  )
}
