import { ArrowLeftOutlined, DownloadOutlined, MailOutlined, PrinterOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Descriptions, Input, Modal, Popconfirm, Result, Row, Skeleton, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { billingApi, methodLabel } from '../api/billing'
import type { InvoiceDetail } from '../api/billing'
import { parseError } from '../api/errors'
import { useIsAdmin } from '../auth/AuthContext'
import { brand } from '../brand/theme'
import { RecordPaymentModal } from '../components/RecordPaymentModal'
import { InvoiceStatusBadge } from '../components/StatusBadge'
import { formatINR } from '../lib/money'
import type { InvoiceLine, Payment } from '../lib/types'

const fmt = (d?: string | null) => (d ? dayjs(d).format('D MMM YYYY') : '—')

/** SRS 9.7 /invoices/:id — lines, totals, payments; Confirm, Cancel, Send, Download PDF, Record payment. */
export default function InvoiceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const { message } = App.useApp()
  const [data, setData] = useState<InvoiceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [voiding, setVoiding] = useState<Payment | null>(null)
  const [voidReason, setVoidReason] = useState('')

  const load = useCallback(() => {
    billingApi
      .getInvoice(Number(id))
      .then(setData)
      .catch((err) => setError(parseError(err).message))
  }, [id])
  useEffect(load, [load])

  if (error) return <Result status="404" title="Invoice not found" subTitle={error} extra={<Button onClick={() => navigate('/invoices')}>All invoices</Button>} />
  if (!data) return <Skeleton active paragraph={{ rows: 10 }} />

  const { invoice: inv, lines, payments } = data
  const balance = inv.total - inv.amountPaid
  const c = inv.customerSnapshot

  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key)
    try {
      await fn()
      message.success(done)
      load()
    } catch (err) {
      message.error(parseError(err).message)
    } finally {
      setBusy(null)
    }
  }

  const cancelBlocked = inv.amountPaid > 0 ? 'Invoices with payments cannot be cancelled' : undefined
  const canCancel = inv.status === 'DRAFT' || inv.status === 'CONFIRMED'

  const lineColumns: ColumnsType<InvoiceLine> = [
    { title: 'Item', dataIndex: 'description' },
    { title: 'Qty', dataIndex: 'quantity', align: 'right' },
    { title: 'Unit price', align: 'right', render: (_, l) => formatINR(l.unitPrice) },
    { title: 'Amount', align: 'right', render: (_, l) => formatINR(l.amount) },
    {
      title: 'Discount',
      align: 'right',
      render: (_, l) =>
        l.discountAmount ? (
          <span title={l.discountName ?? undefined}>
            −{formatINR(l.discountAmount)}
            <Typography.Text type="secondary" className="block text-xs">
              {l.discountName}
            </Typography.Text>
          </span>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'Tax',
      align: 'right',
      render: (_, l) =>
        l.taxAmount ? (
          <span>
            {formatINR(l.taxAmount)}
            <Typography.Text type="secondary" className="block text-xs">
              {l.taxPercent}%
            </Typography.Text>
          </span>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
  ]

  const paymentColumns: ColumnsType<Payment> = [
    { title: 'Received', render: (_, p) => fmt(p.date) },
    { title: 'Method', render: (_, p) => methodLabel(p.method) },
    { title: 'Reference', render: (_, p) => p.reference || <Typography.Text type="secondary">—</Typography.Text> },
    {
      title: 'Amount',
      align: 'right',
      render: (_, p) => (p.voidedAt ? <Typography.Text delete type="secondary">{formatINR(p.amount)}</Typography.Text> : formatINR(p.amount)),
    },
    {
      title: '',
      align: 'right',
      render: (_, p) =>
        p.voidedAt ? (
          <Tooltip title={p.voidReason}>
            <Tag>Voided</Tag>
          </Tooltip>
        ) : isAdmin ? (
          <Button size="small" type="text" onClick={() => setVoiding(p)}>
            Void
          </Button>
        ) : null,
    },
  ]

  const totalRow = (label: string, value: string, strong = false) => (
    <div className="flex justify-between py-1" style={strong ? { fontWeight: 600, fontSize: 16 } : undefined}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )

  return (
    <>
      <Button type="link" icon={<ArrowLeftOutlined />} className="mb-2 px-0" onClick={() => navigate('/invoices')}>
        Invoices
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <Typography.Title level={3} style={{ margin: 0 }}>
              {inv.number}
            </Typography.Title>
            <InvoiceStatusBadge status={inv.status} overdue={inv.overdue} />
          </div>
          <Typography.Text type="secondary">
            {c.company || c.name}, for {fmt(inv.periodStart)} – {fmt(inv.periodEnd)}
          </Typography.Text>
        </div>
        <Space wrap>
          {inv.status === 'DRAFT' && (
            <Button type="primary" loading={busy === 'confirm'} onClick={() => act('confirm', () => billingApi.setInvoiceStatus(inv.id, 'CONFIRMED'), 'Invoice confirmed')}>
              Confirm
            </Button>
          )}
          {inv.status === 'CONFIRMED' && balance > 0 && (
            <Button type="primary" onClick={() => setPaying(true)}>
              Record payment
            </Button>
          )}
          {(inv.status === 'CONFIRMED' || inv.status === 'PAID') && (
            <Button icon={<MailOutlined />} loading={busy === 'send'} onClick={() => act('send', () => billingApi.sendInvoice(inv.id), `Invoice emailed to ${c.email ?? 'the customer'}`)}>
              {inv.emailedAt ? 'Resend' : 'Send'}
            </Button>
          )}
          <Button icon={<DownloadOutlined />} onClick={() => billingApi.openPdf(inv.id).catch((err) => message.error(parseError(err).message))}>
            Download PDF
          </Button>
          <Button icon={<PrinterOutlined />} onClick={() => window.open(`/invoices/${inv.id}/print`, '_blank')}>
            Print
          </Button>
          {canCancel &&
            (cancelBlocked ? (
              <Tooltip title={cancelBlocked}>
                <Button danger disabled>
                  Cancel
                </Button>
              </Tooltip>
            ) : (
              <Popconfirm
                title="Cancel this invoice?"
                description="Any discount it used is returned. The period can be billed again."
                okText="Cancel invoice"
                okButtonProps={{ danger: true }}
                cancelText="Keep"
                onConfirm={() => act('cancel', () => billingApi.setInvoiceStatus(inv.id, 'CANCELLED'), 'Invoice cancelled')}
              >
                <Button danger loading={busy === 'cancel'}>
                  Cancel
                </Button>
              </Popconfirm>
            ))}
        </Space>
      </div>

      {inv.status === 'DRAFT' && (
        <Alert className="mb-6" type="info" showIcon title="Draft invoices can't be paid or become overdue. Confirm it to send it to the customer." />
      )}

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={8}>
          <Card
            style={inv.overdue ? { borderColor: brand.marigold, background: '#FFF8EC' } : inv.status === 'PAID' ? { borderColor: brand.mint, background: '#F1FAF5' } : undefined}
          >
            <Typography.Text type="secondary">{inv.status === 'PAID' ? 'Paid in full' : inv.status === 'CANCELLED' ? 'Cancelled' : 'Balance due'}</Typography.Text>
            <div style={{ fontFamily: brand.fontDisplay, fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {formatINR(inv.status === 'CANCELLED' ? 0 : inv.status === 'PAID' ? inv.total : balance)}
            </div>
            <Typography.Text style={inv.overdue ? { color: '#A86A0F', fontWeight: 600 } : undefined} type={inv.overdue ? undefined : 'secondary'}>
              {inv.overdue
                ? `Due ${fmt(inv.dueDate)}, ${dayjs().diff(dayjs(inv.dueDate), 'day')} days late`
                : inv.status === 'PAID'
                  ? `${payments.filter((p) => !p.voidedAt).length} payment(s) received`
                  : `Due ${fmt(inv.dueDate)}`}
            </Typography.Text>
          </Card>

          <Card title="Bill to" className="mt-6">
            <div className="font-medium">{c.company || c.name}</div>
            {c.company && <div>{c.name}</div>}
            {c.billingAddress && <Typography.Text type="secondary" className="block">{c.billingAddress}</Typography.Text>}
            {c.email && <Typography.Text type="secondary" className="block">{c.email}</Typography.Text>}
            {c.taxId && <div className="mt-2 text-xs">GSTIN {c.taxId}</div>}
            <Descriptions column={1} size="small" className="mt-4">
              <Descriptions.Item label="Subscription">
                <Typography.Link onClick={() => navigate(`/subscriptions/${inv.subscriptionId}`)}>{inv.subscriptionNumber}</Typography.Link>
              </Descriptions.Item>
              <Descriptions.Item label="Issued">{fmt(inv.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Emailed">{inv.emailedAt ? fmt(inv.emailedAt) : 'Not yet'}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card title="Lines" className="mb-6">
            <Table<InvoiceLine> rowKey="id" size="small" pagination={false} dataSource={lines} columns={lineColumns} scroll={{ x: 620 }} />
            <div className="ml-auto mt-4" style={{ maxWidth: 320 }}>
              {totalRow('Subtotal', formatINR(inv.subtotal))}
              {inv.discountTotal > 0 && totalRow('Discount', `−${formatINR(inv.discountTotal)}`)}
              {totalRow('Tax', formatINR(inv.taxTotal))}
              <div className="my-2 border-0 border-t border-solid" style={{ borderColor: brand.line }} />
              {totalRow('Total', formatINR(inv.total), true)}
              {inv.amountPaid > 0 && totalRow('Paid', `−${formatINR(inv.amountPaid)}`)}
              {inv.status !== 'CANCELLED' && totalRow('Balance due', formatINR(balance), true)}
            </div>
          </Card>

          <Card title="Payments">
            <Table<Payment>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={payments}
              columns={paymentColumns}
              scroll={{ x: 520 }}
              locale={{ emptyText: inv.status === 'CONFIRMED' ? 'No payments yet. Use Record payment when money comes in.' : 'No payments.' }}
            />
          </Card>
        </Col>
      </Row>

      <RecordPaymentModal
        invoice={paying ? inv : null}
        onClose={() => setPaying(false)}
        onRecorded={() => {
          setPaying(false)
          load()
        }}
      />

      <Modal
        open={!!voiding}
        title="Void this payment?"
        okText="Void payment"
        okButtonProps={{ danger: true, disabled: !voidReason.trim() }}
        onCancel={() => {
          setVoiding(null)
          setVoidReason('')
        }}
        onOk={async () => {
          if (!voiding) return
          await act('void', () => billingApi.voidPayment(voiding.id, voidReason.trim()), 'Payment voided')
          setVoiding(null)
          setVoidReason('')
        }}
        destroyOnHidden
      >
        <Typography.Paragraph>
          {voiding && `${formatINR(voiding.amount)} by ${methodLabel(voiding.method)} on ${fmt(voiding.date)}`} will no longer count towards this invoice. This is recorded in the audit log.
        </Typography.Paragraph>
        <Input.TextArea rows={2} placeholder="Reason, e.g. cheque bounced" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
      </Modal>
    </>
  )
}
