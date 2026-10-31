import { DownloadOutlined } from '@ant-design/icons'
import { App, Button, Card, Drawer, Empty, Form, Pagination, Popconfirm, Skeleton, Space, Tabs, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import type React from 'react'
import { useSearchParams } from 'react-router-dom'
import { methodLabel } from '../api/billing'
import { api } from '../api/client'
import { applyFieldErrors, parseError } from '../api/errors'
import { portalApi } from '../api/portal'
import { useAuth } from '../auth/AuthContext'
import { brand } from '../brand/theme'
import { CycleRing } from '../components/CycleRing'
import { InvoiceEstimate } from '../components/InvoiceEstimate'
import { LinesEditor } from '../components/LinesEditor'
import type { LineValue } from '../components/LinesEditor'
import { InvoiceStatusBadge, SubscriptionStatusBadge } from '../components/StatusBadge'
import { useCatalog } from '../hooks/useCatalog'
import { usePagedList } from '../hooks/usePagedList'
import { availableActions, cycleInfo } from '../lib/cycle'
import type { ActionDef } from '../lib/cycle'
import { PERIOD_WORD } from '../lib/labels'
import { formatINR } from '../lib/money'
import type { Invoice, Paged, Payment, Plan, Subscription } from '../lib/types'

const fmt = (d?: string | null) => (d ? dayjs(d).format('D MMM YYYY') : '—')

/** Actions a customer can take on their own subscription (SRS 2.1). */
const CUSTOMER_ACTIONS = new Set(['pause', 'resume', 'renew', 'close'])

/** SRS 9.7 /portal — the customer's own subscriptions, invoices and payments. Works from 360 px. */
export default function PortalPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'subscriptions'
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((k) => k + 1)

  return (
    <div className="py-2">
      <h1 style={{ fontFamily: brand.fontDisplay, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: '8px 0 2px' }}>
        Hi {user?.name.split(' ')[0]}
      </h1>
      {user?.profile?.company && <Typography.Text type="secondary">{user.profile.company}</Typography.Text>}

      <BalanceBanner key={`b${refreshKey}`} onShowInvoices={() => setParams({ tab: 'invoices' })} />

      <Tabs
        className="mt-4"
        activeKey={tab}
        onChange={(t) => setParams({ tab: t })}
        items={[
          { key: 'subscriptions', label: 'Subscriptions', children: <MySubscriptions key={`s${refreshKey}`} onChanged={refresh} /> },
          { key: 'invoices', label: 'Invoices', children: <MyInvoices key={`i${refreshKey}`} /> },
          { key: 'payments', label: 'Payments', children: <MyPayments key={`p${refreshKey}`} /> },
          {
            key: 'plans',
            label: 'Browse plans',
            children: (
              <BrowsePlans
                onRequested={() => {
                  refresh()
                  setParams({ tab: 'subscriptions' })
                }}
              />
            ),
          },
        ]}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

function BalanceBanner({ onShowInvoices }: { onShowInvoices: () => void }) {
  const [unpaid, setUnpaid] = useState<Invoice[] | null>(null)
  useEffect(() => {
    api
      .get<Paged<Invoice>>('/portal/invoices', { params: { limit: 100 } })
      .then((r) => setUnpaid(r.data.data.filter((i) => i.status === 'CONFIRMED' && i.amountPaid < i.total)))
      .catch(() => setUnpaid([]))
  }, [])
  if (!unpaid) return <Skeleton.Button active block style={{ height: 96, marginTop: 20 }} />

  const owed = unpaid.reduce((a, i) => a + i.total - i.amountPaid, 0)
  const overdue = unpaid.filter((i) => i.overdue)
  const next = [...unpaid].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]

  if (!owed) {
    return (
      <Card className="mt-5" style={{ background: '#F1FAF5', borderColor: brand.mint }}>
        <div className="font-medium">You're all paid up</div>
        <Typography.Text type="secondary">No invoices are waiting for payment.</Typography.Text>
      </Card>
    )
  }
  return (
    <Card className="mt-5" style={overdue.length ? { background: '#FFF8EC', borderColor: brand.marigold } : undefined}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Typography.Text type="secondary">To pay</Typography.Text>
          <div style={{ fontFamily: brand.fontDisplay, fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15 }}>{formatINR(owed)}</div>
          <Typography.Text style={overdue.length ? { color: '#A86A0F', fontWeight: 600 } : undefined}>
            {overdue.length
              ? `${overdue.length} invoice${overdue.length === 1 ? ' is' : 's are'} overdue`
              : `Next payment due ${fmt(next?.dueDate)}`}
          </Typography.Text>
        </div>
        <Button onClick={onShowInvoices}>See invoices</Button>
      </div>
      <Typography.Paragraph type="secondary" className="mb-0 mt-3 text-xs">
        Pay by bank transfer or UPI and quote the invoice number. Payments show here once Brightloop records them.
      </Typography.Paragraph>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function MySubscriptions({ onChanged }: { onChanged: () => void }) {
  const list = usePagedList<Subscription>('/portal/subscriptions', {}, 20)
  if (list.loading && !list.rows.length) return <Skeleton active />
  if (!list.rows.length) {
    return <Empty description="No subscriptions yet. Browse plans to request one." />
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {list.rows.map((s) => (
        <SubscriptionCard key={s.id} sub={s} onChanged={onChanged} />
      ))}
    </div>
  )
}

function SubscriptionCard({ sub, onChanged }: { sub: Subscription; onChanged: () => void }) {
  const { message } = App.useApp()
  const [busy, setBusy] = useState<string | null>(null)
  const plan = sub.plan
  const info = cycleInfo(sub, plan)
  const actions = availableActions(sub, plan).filter((a) => CUSTOMER_ACTIONS.has(a.action))

  const run = async (a: ActionDef) => {
    setBusy(a.action)
    try {
      await portalApi.changeStatus(sub.id, a.body)
      const done: Record<string, string> = {
        pause: 'Paused. You won’t be billed until you resume.',
        resume: 'Resumed. Billing continues from today.',
        renew: 'Renewed for another term.',
        close: 'Subscription closed.',
      }
      message.success(done[a.action])
      onChanged()
    } catch (err) {
      message.error(parseError(err).message)
    } finally {
      setBusy(null)
    }
  }

  let status: string
  if (sub.status === 'ACTIVE' && info) status = info.daysLeft === 0 ? 'Next invoice today' : `Next invoice in ${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'}, ${fmt(info.nextDate)}`
  else if (sub.status === 'PAUSED') status = 'Paused. No invoices until you resume.'
  else if (sub.status === 'QUOTATION') status = `Waiting for Brightloop to confirm. Offer valid until ${fmt(sub.validUntil)}.`
  else if (sub.status === 'CONFIRMED') status = `Starts ${fmt(sub.startDate)}`
  else if (sub.status === 'CLOSED') status = 'Closed. No further invoices.'
  else status = sub.status === 'CANCELLED' ? 'Cancelled' : 'Being prepared'

  return (
    <Card>
      <div className="flex items-start gap-4">
        <CycleRing
          size={52}
          progress={info?.progress ?? (sub.status === 'CLOSED' ? 1 : 0)}
          dueSoon={sub.status === 'ACTIVE' && info?.dueSoon}
          label={sub.status === 'PAUSED' ? 'II' : info ? `${info.daysLeft}d` : undefined}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{plan?.name}</span>
            <SubscriptionStatusBadge status={sub.status} />
          </div>
          <div className="mt-1">
            <strong>{formatINR(sub.recurringAmount)}</strong>
            {plan && <Typography.Text type="secondary"> / {PERIOD_WORD[plan.billingPeriod]} before tax</Typography.Text>}
          </div>
          <Typography.Text type="secondary" className="mt-1 block text-sm">
            {status}
          </Typography.Text>
          <Typography.Text type="secondary" className="block text-xs">
            {sub.number}
            {sub.status !== 'QUOTATION' && sub.status !== 'CANCELLED' && `, ends ${fmt(sub.expiryDate)}`}
          </Typography.Text>
        </div>
      </div>
      {actions.length > 0 && (
        <Space wrap className="mt-4">
          {actions.map((a) => {
            const btn = (
              <Button
                key={a.action}
                size="small"
                type={a.primary ? 'primary' : 'default'}
                danger={a.danger}
                disabled={!!a.blockedBy}
                loading={busy === a.action}
                onClick={a.confirm ? undefined : () => run(a)}
              >
                {a.label}
              </Button>
            )
            if (a.blockedBy)
              return (
                <Tooltip key={a.action} title={a.blockedBy}>
                  <span>{btn}</span>
                </Tooltip>
              )
            if (a.confirm)
              return (
                <Popconfirm key={a.action} title={a.confirm} okText={a.label} okButtonProps={{ danger: a.danger }} onConfirm={() => run(a)}>
                  {btn}
                </Popconfirm>
              )
            return btn
          })}
        </Space>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------

/** Simple row list with optional paging (antd List is deprecated in v6). */
function Rows<T extends { id: number }>({
  rows,
  loading,
  empty,
  total,
  page,
  onPage,
  render,
}: {
  rows: T[]
  loading: boolean
  empty: string
  total: number
  page: number
  onPage: (p: number) => void
  render: (row: T) => React.ReactNode
}) {
  if (loading && !rows.length) return <Skeleton active />
  if (!rows.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />
  return (
    <Card styles={{ body: { padding: '0 20px' } }}>
      {rows.map((r, i) => (
        <div key={r.id} className="py-4" style={i ? { borderTop: `1px solid ${brand.line}` } : undefined}>
          {render(r)}
        </div>
      ))}
      {total > 10 && (
        <div className="flex justify-center pb-4">
          <Pagination size="small" current={page} pageSize={10} total={total} onChange={onPage} showSizeChanger={false} />
        </div>
      )}
    </Card>
  )
}

function MyInvoices() {
  const { message } = App.useApp()
  const list = usePagedList<Invoice>('/portal/invoices', {}, 10)
  const pg = list.tableProps.pagination
  return (
    <Rows<Invoice>
      rows={list.rows}
      loading={list.loading}
      empty="No invoices yet."
      total={list.total}
      page={pg.current ?? 1}
      onPage={(p) => pg.onChange?.(p, 10)}
      render={(i) => {
        const balance = i.total - i.amountPaid
        return (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{i.number}</span>
                <InvoiceStatusBadge status={i.status} overdue={i.overdue} />
              </div>
              <Typography.Text type="secondary" className="block text-sm">
                {fmt(i.periodStart)} – {fmt(i.periodEnd)}
              </Typography.Text>
              <div className="mt-1 text-sm">
                {formatINR(i.total)}
                {i.status === 'CONFIRMED' && balance > 0 && (
                  <span style={i.overdue ? { color: '#A86A0F', fontWeight: 600 } : undefined}>
                    , {formatINR(balance)} due {fmt(i.dueDate)}
                  </span>
                )}
              </div>
            </div>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => portalApi.openPdf(i.id).catch((err) => message.error(parseError(err).message))}>
              PDF
            </Button>
          </div>
        )
      }}
    />
  )
}

function MyPayments() {
  const list = usePagedList<Payment>('/portal/payments', {}, 10)
  const pg = list.tableProps.pagination
  return (
    <Rows<Payment>
      rows={list.rows}
      loading={list.loading}
      empty="No payments recorded yet."
      total={list.total}
      page={pg.current ?? 1}
      onPage={(p) => pg.onChange?.(p, 10)}
      render={(p) => (
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">{fmt(p.date)}</div>
            <Typography.Text type="secondary" className="text-sm">
              {methodLabel(p.method)} for {p.invoiceNumber}
              {p.reference ? `, ref ${p.reference}` : ''}
            </Typography.Text>
          </div>
          <strong className="whitespace-nowrap">{formatINR(p.amount)}</strong>
        </div>
      )}
    />
  )
}

// ---------------------------------------------------------------------------

function BrowsePlans({ onRequested }: { onRequested: () => void }) {
  const { plans, products, loading } = useCatalog({ availableOnly: true })
  const [chosen, setChosen] = useState<Plan | null>(null)

  if (loading) return <Skeleton active />
  if (!plans.length) return <Empty description="No plans are open right now." />

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id}>
            <div className="text-base font-semibold">{p.name}</div>
            <div className="my-2">
              <span style={{ fontFamily: brand.fontDisplay, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>{formatINR(p.price)}</span>
              <Typography.Text type="secondary"> / {PERIOD_WORD[p.billingPeriod]}</Typography.Text>
            </div>
            <ul className="mb-4 pl-5 text-sm" style={{ color: '#4A5A53' }}>
              <li>Minimum {p.minQty} of each product</li>
              {p.pausable && <li>Pause any time</li>}
              {p.closable && <li>Close before it ends</li>}
              {p.renewable && <li>Renew for another term</li>}
              <li>Open until {fmt(p.endDate)}</li>
            </ul>
            <Button type="primary" block onClick={() => setChosen(p)}>
              Request this plan
            </Button>
          </Card>
        ))}
      </div>
      <RequestDrawer
        plan={chosen}
        products={products}
        onClose={() => setChosen(null)}
        onDone={() => {
          setChosen(null)
          onRequested()
        }}
      />
    </>
  )
}

function RequestDrawer({ plan, products, onClose, onDone }: { plan: Plan | null; products: Parameters<typeof LinesEditor>[0]['products']; onClose: () => void; onDone: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<{ lines: LineValue[] }>()
  const [saving, setSaving] = useState(false)
  const lines: LineValue[] = Form.useWatch('lines', form) ?? []

  useEffect(() => {
    if (plan) form.setFieldsValue({ lines: [] })
  }, [plan, form])

  const submit = useCallback(
    async (v: { lines: LineValue[] }) => {
      if (!plan) return
      setSaving(true)
      try {
        const s = await portalApi.requestPlan(
          plan.id,
          (v.lines ?? []).map((l) => ({ productId: l.productId!, variantId: l.variantId ?? null, quantity: l.quantity! })),
        )
        message.success(`Request sent as ${s.number}. Brightloop will confirm it.`)
        onDone()
      } catch (err) {
        const e = applyFieldErrors(form, err)
        if (!e.fields) message.error(e.message)
      } finally {
        setSaving(false)
      }
    },
    [plan, form, message, onDone],
  )

  return (
    <Drawer
      open={!!plan}
      onClose={onClose}
      title={plan ? `Request ${plan.name}` : ''}
      size={640}
      destroyOnHidden
      footer={
        <Button type="primary" block size="large" loading={saving} onClick={() => form.submit()}>
          Send request
        </Button>
      }
    >
      <Typography.Paragraph type="secondary">
        Add the products you need. Brightloop reviews the request and confirms it. Nothing is billed until then.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={submit}>
        <LinesEditor products={products} minQty={plan?.minQty ?? 1} />
      </Form>
      {plan && (
        <Card size="small" className="mt-6" style={{ background: '#F7F9F8' }}>
          <InvoiceEstimate plan={plan} lines={lines} products={products} />
        </Card>
      )}
    </Drawer>
  )
}
