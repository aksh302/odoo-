import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Popconfirm,
  Result,
  Row,
  Skeleton,
  Space,
  Steps,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { parseError } from '../api/errors'
import { subscriptionsApi } from '../api/subscriptions'
import type { SubscriptionDetail } from '../api/subscriptions'
import { brand } from '../brand/theme'
import { CycleRing } from '../components/CycleRing'
import { InvoiceStatusBadge, SubscriptionStatusBadge } from '../components/StatusBadge'
import { lineTax } from '../lib/estimate'
import { availableActions, cycleInfo } from '../lib/cycle'
import type { ActionDef } from '../lib/cycle'
import { PERIOD_ADVERB, PERIOD_WORD } from '../lib/labels'
import { formatINR } from '../lib/money'
import type { InvoiceSummary, SubscriptionLine, SubscriptionStatus } from '../lib/types'

const fmt = (d?: string | null) => (d ? dayjs(d).format('D MMM YYYY') : '—')

const STEPS: SubscriptionStatus[] = ['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'CLOSED']
const STEP_TITLE: Record<string, string> = {
  DRAFT: 'Draft',
  QUOTATION: 'Quotation',
  CONFIRMED: 'Confirmed',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
}

/** SRS 9.7 /subscriptions/:id — status actions, lines, invoices. */
export default function SubscriptionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [data, setData] = useState<SubscriptionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    subscriptionsApi
      .get(Number(id))
      .then(setData)
      .catch((err) => setError(parseError(err).message))
  }, [id])
  useEffect(load, [load])

  if (error) return <Result status="404" title="Subscription not found" subTitle={error} extra={<Button onClick={() => navigate('/subscriptions')}>All subscriptions</Button>} />
  if (!data) return <Skeleton active paragraph={{ rows: 10 }} />

  const { subscription: sub, lines, invoices } = data
  const plan = sub.plan
  const actions = availableActions(sub, plan, lines.length)
  const canEdit = sub.status === 'DRAFT' || sub.status === 'QUOTATION'

  const run = async (a: ActionDef) => {
    setBusy(a.action)
    try {
      await subscriptionsApi.changeStatus(sub.id, a.body)
      const done: Record<string, string> = {
        send: 'Quotation sent',
        confirm: 'Subscription confirmed',
        activate: 'Subscription is now active',
        pause: 'Billing paused',
        resume: 'Billing resumed',
        renew: 'Renewed for another term',
        close: 'Subscription closed',
        cancel: 'Subscription cancelled',
      }
      message.success(done[a.action])
      load()
    } catch (err) {
      message.error(parseError(err).message)
    } finally {
      setBusy(null)
    }
  }

  const actionButton = (a: ActionDef & { blockedBy?: string }) => {
    const btn = (
      <Button
        key={a.action}
        type={a.primary ? 'primary' : 'default'}
        danger={a.danger}
        disabled={!!a.blockedBy}
        loading={busy === a.action}
        onClick={a.confirm ? undefined : () => run(a)}
      >
        {a.label}
      </Button>
    )
    if (a.blockedBy) {
      return (
        <Tooltip key={a.action} title={a.blockedBy}>
          <span>{btn}</span>
        </Tooltip>
      )
    }
    if (a.confirm) {
      return (
        <Popconfirm key={a.action} title={a.confirm} okText={a.label} okButtonProps={{ danger: a.danger }} onConfirm={() => run(a)}>
          {btn}
        </Popconfirm>
      )
    }
    return btn
  }

  // Lifecycle steps
  const stepIndex = sub.status === 'PAUSED' ? 3 : Math.max(0, STEPS.indexOf(sub.status))
  const quoteExpired = sub.status === 'QUOTATION' && !!sub.validUntil && dayjs().format('YYYY-MM-DD') > sub.validUntil

  // Totals for one period (pre-discount)
  const productsTotal = lines.reduce((a, l) => a + l.amount, 0)
  const taxTotal = lines.reduce((a, l) => a + lineTax(l.amount, l.tax?.percent), 0)
  const perPeriod = (plan?.price ?? 0) + productsTotal + taxTotal

  const lineColumns: ColumnsType<SubscriptionLine> = [
    { title: 'Item', dataIndex: 'description' },
    { title: 'Qty', dataIndex: 'quantity', align: 'right' },
    { title: 'Unit price', align: 'right', render: (_, l) => formatINR(l.unitPrice) },
    { title: 'Tax', render: (_, l) => l.tax?.name ?? '—' },
    { title: 'Amount', align: 'right', render: (_, l) => formatINR(l.amount) },
  ]
  const planFeeRow: SubscriptionLine = {
    id: -1,
    productId: 0,
    description: `Plan fee (${plan?.name ?? ''})`,
    quantity: 1,
    unitPrice: plan?.price ?? 0,
    amount: plan?.price ?? 0,
    tax: null,
  }

  const invoiceColumns: ColumnsType<InvoiceSummary> = [
    {
      title: 'Invoice',
      render: (_, i) => (
        <Typography.Link className="whitespace-nowrap" onClick={() => navigate(`/invoices/${i.id}`)}>
          {i.number}
        </Typography.Link>
      ),
    },
    { title: 'Period', render: (_, i) => <span className="whitespace-nowrap">{fmt(i.periodStart)} – {fmt(i.periodEnd)}</span> },
    { title: 'Due', render: (_, i) => <span className="whitespace-nowrap">{fmt(i.dueDate)}</span> },
    { title: 'Total', align: 'right', render: (_, i) => formatINR(i.total) },
    { title: 'Paid', align: 'right', render: (_, i) => formatINR(i.amountPaid) },
    { title: 'Status', render: (_, i) => <InvoiceStatusBadge status={i.status} overdue={i.overdue} /> },
  ]

  return (
    <>
      <Button type="link" icon={<ArrowLeftOutlined />} className="mb-2 px-0" onClick={() => navigate('/subscriptions')}>
        Subscriptions
      </Button>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Typography.Title level={3} style={{ margin: 0 }}>
              {sub.number}
            </Typography.Title>
            <SubscriptionStatusBadge status={sub.status} />
          </div>
          <Typography.Text type="secondary">
            {sub.customer?.name}
            {sub.customer?.company ? `, ${sub.customer.company}` : ''}
          </Typography.Text>
        </div>
        <Space wrap>
          {canEdit && (
            <Button icon={<EditOutlined />} onClick={() => navigate(`/subscriptions/${sub.id}/edit`)}>
              Edit
            </Button>
          )}
          {actions.map(actionButton)}
        </Space>
      </div>

      {sub.status === 'CANCELLED' ? (
        <Alert className="mb-6" type="error" showIcon title="This subscription was cancelled. It will never be billed." />
      ) : (
        <Card className="mb-6">
          <Steps
            current={stepIndex}
            status={sub.status === 'CLOSED' ? 'finish' : 'process'}
            items={STEPS.map((s, i) => ({
              title: s === 'ACTIVE' && sub.status === 'PAUSED' ? 'Paused' : STEP_TITLE[s],
              content:
                i === 1 && sub.quotationDate ? `Sent ${fmt(sub.quotationDate)}` : i === 3 && sub.startDate ? `From ${fmt(sub.startDate)}` : undefined,
            }))}
          />
        </Card>
      )}

      {quoteExpired && (
        <Alert
          className="mb-6"
          type="warning"
          showIcon
          title={`This quotation expired on ${fmt(sub.validUntil)}. Edit it and send it again, or cancel it.`}
        />
      )}

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={9}>
          <BillingCard sub={sub} perPeriod={perPeriod} />
          <Card title="Details" className="mt-6">
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Plan">
                <span>
                  {plan?.name}
                  {plan && (
                    <Typography.Text type="secondary" className="ml-1">
                      {formatINR(plan.price)} / {PERIOD_WORD[plan.billingPeriod]}
                    </Typography.Text>
                  )}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Customer">{sub.customer?.email}</Descriptions.Item>
              <Descriptions.Item label="Starts">{fmt(sub.startDate)}</Descriptions.Item>
              <Descriptions.Item label="Expires">{fmt(sub.expiryDate)}</Descriptions.Item>
              <Descriptions.Item label="Payment due">{sub.paymentTerms} days after each period starts</Descriptions.Item>
              {sub.quotationDate && <Descriptions.Item label="Quoted">{fmt(sub.quotationDate)}</Descriptions.Item>}
              {sub.validUntil && (
                <Descriptions.Item label="Quote valid until">
                  {fmt(sub.validUntil)} {quoteExpired && <Tag color="warning">Expired</Tag>}
                </Descriptions.Item>
              )}
              {plan && (
                <Descriptions.Item label="Plan allows">
                  {[plan.pausable && 'pause', plan.renewable && 'renew', plan.closable && 'close early', plan.autoClose && 'auto-close at plan end']
                    .filter(Boolean)
                    .join(', ') || 'no changes'}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={15}>
          <Card title="What each invoice includes" className="mb-6">
            <Table<SubscriptionLine>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={[planFeeRow, ...lines]}
              columns={lineColumns}
              scroll={{ x: 560 }}
              summary={() => (
                <>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4} align="right">Tax</Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">{formatINR(taxTotal)}</Table.Summary.Cell>
                  </Table.Summary.Row>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4} align="right">
                      <strong>Total per {plan ? PERIOD_WORD[plan.billingPeriod] : 'period'}</strong>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <strong>{formatINR(perPeriod)}</strong>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </>
              )}
            />
            <Typography.Paragraph type="secondary" className="mt-3 mb-0 text-xs">
              Prices were fixed when the lines were added; later price changes don't affect this subscription. Discounts are applied on each invoice.
            </Typography.Paragraph>
          </Card>

          <Card title="Invoices">
            <Table<InvoiceSummary>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={invoices}
              columns={invoiceColumns}
              scroll={{ x: 640 }}
              locale={{
                emptyText:
                  sub.status === 'ACTIVE' ? 'No invoices yet. The next billing run creates the first one.' : 'Invoices start once the subscription is active.',
              }}
            />
          </Card>
        </Col>
      </Row>
    </>
  )
}

/** The signature cycle view: where this subscription is in its billing period. */
function BillingCard({ sub, perPeriod }: { sub: SubscriptionDetail['subscription']; perPeriod: number }) {
  const plan = sub.plan
  const info = cycleInfo(sub, plan)
  let headline: string
  let sub2: string
  if (sub.status === 'ACTIVE' && info) {
    headline = info.daysLeft === 0 ? 'Next invoice today' : `Next invoice in ${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'}`
    sub2 = `${fmt(info.nextDate)}, for ${formatINR(perPeriod)}`
  } else if (sub.status === 'PAUSED') {
    headline = 'Billing is paused'
    sub2 = 'No invoices until it is resumed. Paused time is never billed.'
  } else if (sub.status === 'CONFIRMED') {
    headline = `Starts ${fmt(sub.startDate)}`
    sub2 = 'It becomes active and is billed from that day.'
  } else if (sub.status === 'DRAFT' || sub.status === 'QUOTATION') {
    headline = 'Not billing yet'
    sub2 = sub.status === 'DRAFT' ? 'Send it as a quotation, then confirm it.' : 'Waiting for the customer to accept.'
  } else {
    headline = sub.status === 'CLOSED' ? 'Closed' : 'Cancelled'
    sub2 = 'No further invoices.'
  }

  return (
    <Card style={{ background: brand.pine, borderColor: brand.pine }}>
      <div className="flex items-center gap-5">
        <div style={{ background: '#FFFFFF', borderRadius: '50%', padding: 6, lineHeight: 0 }}>
          <CycleRing
            size={84}
            progress={info?.progress ?? (sub.status === 'CLOSED' ? 1 : 0)}
            dueSoon={sub.status === 'ACTIVE' && info?.dueSoon}
            label={sub.status === 'PAUSED' ? 'II' : info ? `${info.daysLeft}d` : '–'}
          />
        </div>
        <div>
          <div style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 600, fontFamily: brand.fontDisplay, letterSpacing: '-0.01em' }}>{headline}</div>
          <div style={{ color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>{sub2}</div>
          {plan && (
            <div style={{ color: brand.mint, marginTop: 8, fontSize: 13 }}>
              Bills {PERIOD_ADVERB[plan.billingPeriod]}
              {sub.anchorDay && (plan.billingPeriod === 'MONTHLY' || plan.billingPeriod === 'YEARLY') ? ` on day ${sub.anchorDay}` : ''}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
