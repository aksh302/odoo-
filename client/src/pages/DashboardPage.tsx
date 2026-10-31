import { DownloadOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, DatePicker, Row, Select, Skeleton, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Rectangle, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { parseError } from '../api/errors'
import { reportsApi } from '../api/reports'
import type { ReportFilters, Summary } from '../api/reports'
import { brand } from '../brand/theme'
import { CustomerSelect } from '../components/CustomerSelect'
import { RecordPaymentModal } from '../components/RecordPaymentModal'
import { useCatalog } from '../hooks/useCatalog'
import { usePagedList } from '../hooks/usePagedList'
import { formatINR, formatINRCompact, formatINRWhole } from '../lib/money'
import type { Invoice } from '../lib/types'

const fmt = (d: string) => dayjs(d).format('D MMM YYYY')
const GRID = '#E6ECE9'
const AXIS_TEXT = '#5B6B64'

/**
 * SRS 9.7 /dashboard — the finance lead's month-end view (FR-8.1 to 8.8).
 * Date range filters payments received; outstanding and overdue are always as of today.
 */
export default function DashboardPage() {
  const { message } = App.useApp()
  const { plans } = useCatalog({ availableOnly: false })
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(11, 'month').startOf('month'), dayjs()])
  const [customerId, setCustomerId] = useState<number | undefined>()
  const [planId, setPlanId] = useState<number | undefined>()
  const [data, setData] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const filters: ReportFilters = {
    from: range[0].format('YYYY-MM-DD'),
    to: range[1].format('YYYY-MM-DD'),
    customerId,
    planId,
  }
  const key = JSON.stringify(filters)

  useEffect(() => {
    setError(null)
    reportsApi
      .summary(filters)
      .then(setData)
      .catch((err) => setError(parseError(err).message))
  }, [key, reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = async () => {
    setExporting(true)
    try {
      await reportsApi.exportCsv(filters)
    } catch (err) {
      message.error(parseError(err).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Typography.Title level={3}>Dashboard</Typography.Title>
        <Button icon={<DownloadOutlined />} loading={exporting} onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      {/* Filters: one row above everything they affect */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <DatePicker.RangePicker
          picker="month"
          format="MMM YYYY"
          allowClear={false}
          value={range}
          onChange={(r) => r?.[0] && r[1] && setRange([r[0].startOf('month'), r[1].isSame(dayjs(), 'month') ? dayjs() : r[1].endOf('month')])}
        />
        <CustomerSelect allowClear placeholder="All customers" value={customerId} onChange={setCustomerId} style={{ width: 240 }} />
        <Select allowClear placeholder="All plans" style={{ width: 200 }} value={planId} onChange={setPlanId} options={plans.map((p) => ({ value: p.id, label: p.name }))} />
        <Typography.Text type="secondary" className="text-xs">
          Dates filter payments received. Outstanding and overdue are as of today.
        </Typography.Text>
      </div>

      {error && <Alert className="mb-6" type="error" showIcon title={error} />}
      {!data ? (
        <Skeleton active paragraph={{ rows: 12 }} />
      ) : (
        <>
          <Kpis s={data} from={range[0]} to={range[1]} />
          <Row gutter={[24, 24]} className="mt-6">
            <Col xs={24} xl={16}>
              <Card title="Revenue collected by month">
                <RevenueChart rows={data.revenueByMonth} />
              </Card>
            </Col>
            <Col xs={24} xl={8}>
              <Card title="Overdue by age" style={{ height: '100%' }}>
                <Aging s={data} />
              </Card>
            </Col>
          </Row>
          <OverdueInvoices customerId={customerId} onPaid={() => setReloadKey((k) => k + 1)} />
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

function Kpis({ s, from, to }: { s: Summary; from: Dayjs; to: Dayjs }) {
  const tile = (label: string, value: string, note: string, opts: { warn?: boolean } = {}) => (
    <Card
        key={label}
        style={{ height: '100%', minWidth: 0, ...(opts.warn ? { borderColor: brand.marigold, background: '#FFF8EC' } : {}) }}
        styles={{ body: { padding: 18 } }}
      >
        <Typography.Text type="secondary">{label}</Typography.Text>
        <div style={{ fontFamily: brand.fontDisplay, fontSize: 'clamp(22px, 2.1vw, 28px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '4px 0', whiteSpace: 'nowrap' }}>{value}</div>
        <Typography.Text type="secondary" className="text-xs" style={opts.warn ? { color: '#8A5A0C' } : undefined}>
          {note}
        </Typography.Text>
      </Card>
  )
  const period = `${from.format('MMM YYYY')} – ${to.format('MMM YYYY')}`
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {tile('Active subscriptions', String(s.activeSubscriptions), 'Being billed now')}
      {tile('Monthly recurring revenue', formatINRWhole(s.mrr), `ARR ${formatINRWhole(s.arr)}`)}
      {tile('Collected', formatINRWhole(s.revenueCollected), period)}
      {tile('Outstanding', formatINRWhole(s.outstanding), `${s.counts.outstanding} unpaid invoices`)}
      {tile('Overdue', formatINRWhole(s.overdueAmount), s.overdueCount ? `${s.overdueCount} invoices past due` : 'Nothing past due', { warn: s.overdueCount > 0 })}
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Single series, so no legend: the card title names it. Hover shows the exact amount. */
function RevenueChart({ rows }: { rows: Summary['revenueByMonth'] }) {
  const data = rows.map((r) => ({ ...r, label: dayjs(`${r.month}-01`).format(rows.length > 12 ? "MMM 'YY" : 'MMM') }))
  if (!data.some((r) => r.collected > 0)) {
    return <Typography.Text type="secondary">No payments were received in this period.</Typography.Text>
  }
  return (
    <div style={{ width: '100%', height: 280 }} role="img" aria-label="Revenue collected per month">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS_TEXT, fontSize: 12 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v: number) => formatINRCompact(v)} tickLine={false} axisLine={false} tick={{ fill: AXIS_TEXT, fontSize: 12 }} width={56} />
          <Tooltip
            cursor={{ fill: 'rgba(31,107,82,0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as (typeof data)[number]
              return (
                <div style={{ background: '#fff', border: `1px solid ${brand.line}`, borderRadius: 6, padding: '8px 10px', boxShadow: '0 2px 8px rgba(22,53,44,0.08)' }}>
                  <div style={{ color: AXIS_TEXT, fontSize: 12 }}>{dayjs(`${p.month}-01`).format('MMMM YYYY')}</div>
                  <div style={{ fontWeight: 600 }}>{formatINR(p.collected)}</div>
                </div>
              )
            }}
          />
          <Bar
            dataKey="collected"
            fill={brand.green}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            activeBar={<Rectangle fill="#185A45" radius={[4, 4, 0, 0]} />}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Three buckets of one measure: horizontal bars, value printed at the tip so it never relies on colour. */
function Aging({ s }: { s: Summary }) {
  const buckets = [
    { label: '1–30 days late', value: s.aging.d0_30 },
    { label: '31–60 days late', value: s.aging.d31_60 },
    { label: 'Over 60 days late', value: s.aging.d60plus },
  ]
  const max = Math.max(1, ...buckets.map((b) => b.value))
  if (!s.overdueAmount) {
    return (
      <div>
        <div className="font-medium">Nothing is overdue</div>
        <Typography.Text type="secondary">Every confirmed invoice is within its due date.</Typography.Text>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      {buckets.map((b) => (
        <div key={b.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{b.label}</span>
            <span className="font-semibold">{formatINR(b.value)}</span>
          </div>
          <div style={{ height: 12, background: '#F2F5F3', borderRadius: 4 }}>
            <div
              style={{
                width: `${(b.value / max) * 100}%`,
                minWidth: b.value ? 4 : 0,
                height: '100%',
                background: brand.marigold,
                borderRadius: 4,
              }}
              title={`${b.label}: ${formatINR(b.value)}`}
            />
          </div>
        </div>
      ))}
      <Typography.Text type="secondary" className="text-xs">
        {s.overdueCount} invoice{s.overdueCount === 1 ? '' : 's'}, {formatINR(s.overdueAmount)} in total. Chase the oldest first.
      </Typography.Text>
    </div>
  )
}

// ---------------------------------------------------------------------------

function OverdueInvoices({ customerId, onPaid }: { customerId?: number; onPaid: () => void }) {
  const navigate = useNavigate()
  const [paying, setPaying] = useState<Invoice | null>(null)
  const list = usePagedList<Invoice>('/invoices', { overdue: true, customerId }, 5)
  const rows = [...list.rows].sort((a, b) => a.dueDate.localeCompare(b.dueDate))

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
      title: 'Was due',
      render: (_, i) => (
        <span className="whitespace-nowrap">
          {fmt(i.dueDate)}
          <Typography.Text type="secondary" className="block text-xs">
            {dayjs().diff(dayjs(i.dueDate), 'day')} days late
          </Typography.Text>
        </span>
      ),
    },
    { title: 'Balance due', align: 'right', render: (_, i) => <strong>{formatINR(i.total - i.amountPaid)}</strong> },
    {
      title: '',
      align: 'right',
      render: (_, i) => (
        <Button size="small" onClick={() => setPaying(i)}>
          Record payment
        </Button>
      ),
    },
  ]

  return (
    <Card
      title="Overdue invoices"
      className="mt-6"
      extra={
        <Button type="link" onClick={() => navigate('/invoices')}>
          All invoices
        </Button>
      }
    >
      <Table<Invoice>
        {...list.tableProps}
        dataSource={rows}
        columns={columns}
        size="small"
        scroll={{ x: 640 }}
        locale={{ emptyText: 'Nothing overdue.' }}
      />
      <RecordPaymentModal
        invoice={paying}
        onClose={() => setPaying(null)}
        onRecorded={() => {
          setPaying(null)
          list.reload()
          onPaid()
        }}
      />
    </Card>
  )
}
