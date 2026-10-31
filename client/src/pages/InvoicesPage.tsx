import { SearchOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, DatePicker, Input, Popconfirm, Segmented, Space, Switch, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { billingApi } from '../api/billing'
import { parseError } from '../api/errors'
import { InvoiceStatusBadge } from '../components/StatusBadge'
import { usePagedList } from '../hooks/usePagedList'
import { formatINR } from '../lib/money'
import type { Invoice, InvoiceStatus } from '../lib/types'

const fmt = (d: string) => dayjs(d).format('D MMM YYYY')

const STATUSES: { value: InvoiceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

/** SRS 9.7 /invoices — filters, overdue toggle, bulk Confirm drafts. */
export default function InvoicesPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<InvoiceStatus | 'ALL'>('ALL')
  const [overdue, setOverdue] = useState(false)
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [confirming, setConfirming] = useState(false)
  const list = usePagedList<Invoice>('/invoices', {
    q: search,
    status: status === 'ALL' ? undefined : status,
    overdue: overdue || undefined,
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
  })

  const confirmDrafts = async (ids?: number[]) => {
    setConfirming(true)
    try {
      const n = await billingApi.confirmDrafts(ids)
      message.success(n ? `Confirmed ${n} draft invoice${n === 1 ? '' : 's'}` : 'There are no drafts to confirm')
      setSelected([])
      list.reload()
    } catch (err) {
      message.error(parseError(err).message)
    } finally {
      setConfirming(false)
    }
  }

  const columns: ColumnsType<Invoice> = [
    {
      title: 'Invoice',
      render: (_, i) => (
        <Typography.Link className="whitespace-nowrap" onClick={() => navigate(`/invoices/${i.id}`)}>
          {i.number}
        </Typography.Link>
      ),
    },
    {
      title: 'Customer',
      render: (_, i) => (
        <span>
          {i.customerSnapshot.company || i.customerSnapshot.name}
          <Typography.Text type="secondary" className="block text-xs">
            {i.subscriptionNumber}
          </Typography.Text>
        </span>
      ),
    },
    {
      title: 'Period',
      render: (_, i) => (
        <span className="whitespace-nowrap">
          {fmt(i.periodStart)} – {fmt(i.periodEnd)}
        </span>
      ),
    },
    {
      title: 'Due',
      render: (_, i) => (
        <span className="whitespace-nowrap" style={i.overdue ? { color: '#B42318', fontWeight: 600 } : undefined}>
          {fmt(i.dueDate)}
          {i.overdue && (
            <Typography.Text type="danger" className="block text-xs">
              {dayjs().diff(dayjs(i.dueDate), 'day')} days late
            </Typography.Text>
          )}
        </span>
      ),
    },
    { title: 'Total', align: 'right', render: (_, i) => formatINR(i.total) },
    {
      title: 'Balance due',
      align: 'right',
      render: (_, i) =>
        i.status === 'CANCELLED' ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          <strong>{formatINR(i.total - i.amountPaid)}</strong>
        ),
    },
    { title: 'Status', render: (_, i) => <InvoiceStatusBadge status={i.status} overdue={i.overdue} /> },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Typography.Title level={3}>Invoices</Typography.Title>
        <Space wrap>
          {selected.length > 0 && (
            <Button loading={confirming} onClick={() => confirmDrafts(selected)}>
              Confirm {selected.length} selected
            </Button>
          )}
          <Popconfirm title="Confirm every draft invoice?" okText="Confirm all" onConfirm={() => confirmDrafts()}>
            <Button loading={confirming && !selected.length}>Confirm all drafts</Button>
          </Popconfirm>
        </Space>
      </div>
      <Card>
        <div className="mb-4 overflow-x-auto">
          <Segmented options={STATUSES} value={status} onChange={(v) => setStatus(v as InvoiceStatus | 'ALL')} />
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            className="max-w-xs"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Invoice, customer or subscription"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <DatePicker.RangePicker
            format="D MMM YYYY"
            placeholder={['Period from', 'to']}
            value={range}
            onChange={(r) => setRange(r)}
          />
          <Space>
            <Switch size="small" checked={overdue} onChange={setOverdue} />
            <span>Overdue only</span>
          </Space>
        </div>
        {list.error && <Alert className="mb-4" type="error" showIcon title={list.error} />}
        <Table<Invoice>
          {...list.tableProps}
          columns={columns}
          scroll={{ x: 1000 }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys as number[]),
            getCheckboxProps: (i) => ({ disabled: i.status !== 'DRAFT' }),
          }}
          onRow={(i) => ({
            onClick: (e) => {
              if ((e.target as HTMLElement).closest('.ant-checkbox-wrapper, .ant-table-selection-column')) return
              navigate(`/invoices/${i.id}`)
            },
            style: { cursor: 'pointer' },
          })}
          locale={{ emptyText: overdue ? 'Nothing overdue. Every confirmed invoice is within its due date.' : 'No invoices match these filters.' }}
        />
      </Card>
    </>
  )
}
