import { SearchOutlined } from '@ant-design/icons'
import { Alert, Button, Card, DatePicker, Input, Table, Tabs, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { methodLabel } from '../api/billing'
import { RecordPaymentModal } from '../components/RecordPaymentModal'
import { InvoiceStatusBadge } from '../components/StatusBadge'
import { usePagedList } from '../hooks/usePagedList'
import { formatINR } from '../lib/money'
import type { Invoice, Payment } from '../lib/types'

const fmt = (d: string) => dayjs(d).format('D MMM YYYY')

/** SRS 9.7 /payments — payment list, outstanding invoices tab, record-payment modal. */
export default function PaymentsPage() {
  const [tab, setTab] = useState('outstanding')
  return (
    <>
      <Typography.Title level={3} className="mb-4">
        Payments
      </Typography.Title>
      <Card>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'outstanding', label: 'Waiting for payment', children: <Outstanding /> },
            { key: 'received', label: 'Received', children: <Received /> },
          ]}
        />
      </Card>
    </>
  )
}

function Outstanding() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [paying, setPaying] = useState<Invoice | null>(null)
  const list = usePagedList<Invoice>('/invoices', { q: search, status: 'CONFIRMED' })

  const columns: ColumnsType<Invoice> = [
    {
      title: 'Invoice',
      render: (_, i) => (
        <Typography.Link className="whitespace-nowrap" onClick={() => navigate(`/invoices/${i.id}`)}>
          {i.number}
        </Typography.Link>
      ),
    },
    { title: 'Customer', render: (_, i) => i.customerSnapshot.company || i.customerSnapshot.name },
    {
      title: 'Due',
      render: (_, i) => (
        <span className="whitespace-nowrap" style={i.overdue ? { color: '#B42318', fontWeight: 600 } : undefined}>
          {fmt(i.dueDate)}
        </span>
      ),
    },
    { title: 'Status', render: (_, i) => <InvoiceStatusBadge status={i.status} overdue={i.overdue} /> },
    { title: 'Total', align: 'right', render: (_, i) => formatINR(i.total) },
    { title: 'Balance due', align: 'right', render: (_, i) => <strong>{formatINR(i.total - i.amountPaid)}</strong> },
    {
      title: '',
      align: 'right',
      render: (_, i) => (
        <Button size="small" type="primary" onClick={() => setPaying(i)}>
          Record payment
        </Button>
      ),
    },
  ]

  return (
    <>
      <Input
        className="mb-4 max-w-xs"
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Invoice or customer"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {list.error && <Alert className="mb-4" type="error" showIcon title={list.error} />}
      <Table<Invoice>
        {...list.tableProps}
        columns={columns}
        scroll={{ x: 900 }}
        locale={{ emptyText: 'Every confirmed invoice is paid.' }}
      />
      <RecordPaymentModal
        invoice={paying}
        onClose={() => setPaying(null)}
        onRecorded={() => {
          setPaying(null)
          list.reload()
        }}
      />
    </>
  )
}

function Received() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const list = usePagedList<Payment>('/payments', {
    q: search,
    from: range?.[0]?.format('YYYY-MM-DD'),
    to: range?.[1]?.format('YYYY-MM-DD'),
  })

  const columns: ColumnsType<Payment> = [
    { title: 'Received', render: (_, p) => <span className="whitespace-nowrap">{fmt(p.date)}</span> },
    {
      title: 'Invoice',
      render: (_, p) => (
        <Typography.Link className="whitespace-nowrap" onClick={() => navigate(`/invoices/${p.invoiceId}`)}>
          {p.invoiceNumber}
        </Typography.Link>
      ),
    },
    { title: 'Customer', dataIndex: 'customerName' },
    { title: 'Method', render: (_, p) => methodLabel(p.method) },
    { title: 'Reference', render: (_, p) => p.reference || <Typography.Text type="secondary">—</Typography.Text> },
    {
      title: 'Amount',
      align: 'right',
      render: (_, p) =>
        p.voidedAt ? (
          <Tooltip title={`Voided: ${p.voidReason}`}>
            <Typography.Text delete type="secondary">
              {formatINR(p.amount)}
            </Typography.Text>{' '}
            <Tag>Voided</Tag>
          </Tooltip>
        ) : (
          <strong>{formatINR(p.amount)}</strong>
        ),
    },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Invoice, customer or reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <DatePicker.RangePicker format="D MMM YYYY" placeholder={['Received from', 'to']} value={range} onChange={(r) => setRange(r)} />
      </div>
      {list.error && <Alert className="mb-4" type="error" showIcon title={list.error} />}
      <Table<Payment> {...list.tableProps} columns={columns} scroll={{ x: 900 }} locale={{ emptyText: 'No payments in this range.' }} />
    </>
  )
}
