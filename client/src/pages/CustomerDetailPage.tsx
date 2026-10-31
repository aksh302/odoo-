import { ArrowLeftOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Card, Col, Descriptions, Result, Row, Skeleton, Space, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { adminApi } from '../api/admin'
import type { CustomerDetail } from '../api/admin'
import { parseError } from '../api/errors'
import { brand } from '../brand/theme'
import { CustomerDrawer } from '../components/CustomerDrawer'
import { InvoiceStatusBadge, SubscriptionStatusBadge } from '../components/StatusBadge'
import { PERIOD_WORD } from '../lib/labels'
import { formatINR } from '../lib/money'
import type { Invoice, Subscription } from '../lib/types'
import { NextInvoice } from './SubscriptionsPage'

const fmt = (d: string) => dayjs(d).format('D MMM YYYY')

/** SRS 9.7 /customers/:id — profile, their subscriptions and invoices. */
export default function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<CustomerDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const load = useCallback(() => {
    adminApi
      .getCustomer(Number(id))
      .then(setData)
      .catch((err) => setError(parseError(err).message))
  }, [id])
  useEffect(load, [load])

  if (error) return <Result status="404" title="Customer not found" subTitle={error} extra={<Button onClick={() => navigate('/customers')}>All customers</Button>} />
  if (!data) return <Skeleton active paragraph={{ rows: 10 }} />

  const { customer: c, subscriptions, invoices } = data
  const open = invoices.filter((i) => i.status === 'CONFIRMED' && i.amountPaid < i.total)
  const owed = open.reduce((a, i) => a + i.total - i.amountPaid, 0)
  const overdue = open.filter((i) => i.overdue)
  const mrr = subscriptions
    .filter((s) => s.status === 'ACTIVE' && s.plan)
    .reduce((a, s) => {
      const k = { DAILY: 30, WEEKLY: 52 / 12, MONTHLY: 1, YEARLY: 1 / 12 }[s.plan!.billingPeriod]
      return a + (s.recurringAmount ?? 0) * k
    }, 0)

  const subColumns: ColumnsType<Subscription> = [
    { title: 'Subscription', render: (_, s) => <Typography.Link onClick={() => navigate(`/subscriptions/${s.id}`)}>{s.number}</Typography.Link> },
    { title: 'Plan', render: (_, s) => s.plan?.name },
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
  ]
  const invColumns: ColumnsType<Invoice> = [
    { title: 'Invoice', render: (_, i) => <Typography.Link className="whitespace-nowrap" onClick={() => navigate(`/invoices/${i.id}`)}>{i.number}</Typography.Link> },
    { title: 'Period', render: (_, i) => <span className="whitespace-nowrap">{fmt(i.periodStart)} – {fmt(i.periodEnd)}</span> },
    { title: 'Total', align: 'right', render: (_, i) => formatINR(i.total) },
    { title: 'Balance', align: 'right', render: (_, i) => (i.status === 'CANCELLED' ? '—' : formatINR(i.total - i.amountPaid)) },
    { title: 'Status', render: (_, i) => <InvoiceStatusBadge status={i.status} overdue={i.overdue} /> },
  ]

  const stat = (label: string, value: string, warn = false) => (
    <div>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <div style={{ fontFamily: brand.fontDisplay, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: warn ? '#A86A0F' : undefined }}>{value}</div>
    </div>
  )

  return (
    <>
      <Button type="link" icon={<ArrowLeftOutlined />} className="mb-2 px-0" onClick={() => navigate('/customers')}>
        Customers
      </Button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {c.profile?.company || c.name}
          </Typography.Title>
          <Typography.Text type="secondary">{c.profile?.company ? `${c.name}, ${c.email}` : c.email}</Typography.Text>
        </div>
        <Space wrap>
          <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/subscriptions/new?customer=${c.id}`)}>
            New subscription
          </Button>
        </Space>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={8}>
          <Card>
            <div className="grid grid-cols-2 gap-4">
              {stat('Monthly recurring', formatINR(Math.round(mrr)))}
              {stat('Balance due', formatINR(owed), overdue.length > 0)}
            </div>
            {overdue.length > 0 && (
              <Typography.Text className="mt-2 block text-sm" style={{ color: '#A86A0F' }}>
                {overdue.length} invoice{overdue.length === 1 ? '' : 's'} overdue
              </Typography.Text>
            )}
          </Card>
          <Card title="Billing profile" className="mt-6">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Company">{c.profile?.company || '—'}</Descriptions.Item>
              <Descriptions.Item label="Phone">{c.profile?.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="Address">{c.profile?.billingAddress || '—'}</Descriptions.Item>
              <Descriptions.Item label="GSTIN">{c.profile?.taxId || '—'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card title="Subscriptions" className="mb-6">
            <Table<Subscription> rowKey="id" size="small" pagination={false} dataSource={subscriptions} columns={subColumns} scroll={{ x: 640 }} locale={{ emptyText: 'No subscriptions yet.' }} />
          </Card>
          <Card title="Invoices">
            <Table<Invoice>
              rowKey="id"
              size="small"
              dataSource={invoices}
              columns={invColumns}
              pagination={invoices.length > 8 ? { pageSize: 8, size: 'small' } : false}
              scroll={{ x: 600 }}
              locale={{ emptyText: 'No invoices yet.' }}
            />
          </Card>
        </Col>
      </Row>

      <CustomerDrawer
        target={editing ? c : null}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          load()
        }}
      />
    </>
  )
}
