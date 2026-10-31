import { Alert, App, Button, Card, Col, DatePicker, Row, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { billingApi } from '../api/billing'
import type { RunResult } from '../api/billing'
import { parseError } from '../api/errors'
import { brand } from '../brand/theme'
import { usePagedList } from '../hooks/usePagedList'
import type { BillingRun } from '../lib/types'

/** Matches the server's DEMO_MODE: lets the run pretend it is a later date (FR-6.15). */
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== 'false'

/** SRS 9.7 /billing — run button, results panel, history of runs with failures. */
export default function BillingPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [asOf, setAsOf] = useState<Dayjs>(dayjs())
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<(RunResult & { asOf: string }) | null>(null)
  const history = usePagedList<BillingRun>('/billing/runs', {}, 10)

  const run = async () => {
    setRunning(true)
    try {
      const date = asOf.format('YYYY-MM-DD')
      const isToday = asOf.isSame(dayjs(), 'day')
      const r = await billingApi.run(DEMO_MODE && !isToday ? date : undefined)
      setResult({ ...r, asOf: date })
      history.reload()
    } catch (err) {
      message.error(parseError(err).message)
    } finally {
      setRunning(false)
    }
  }

  const columns: ColumnsType<BillingRun> = [
    { title: 'Ran at', render: (_, r) => <span className="whitespace-nowrap">{dayjs(r.startedAt).format('D MMM YYYY, h:mm a')}</span> },
    { title: 'Billed as of', render: (_, r) => dayjs(r.asOf).format('D MMM YYYY') },
    { title: 'Started by', dataIndex: 'triggeredBy' },
    { title: 'Created', dataIndex: 'created', align: 'right' },
    { title: 'Skipped', dataIndex: 'skipped', align: 'right' },
    {
      title: 'Failed',
      align: 'right',
      render: (_, r) => (r.failed ? <Tag color="error">{r.failed}</Tag> : 0),
    },
  ]

  const stat = (label: string, value: number, help: string, tone?: string) => (
    <Col xs={8}>
      <div style={{ fontFamily: brand.fontDisplay, fontSize: 30, fontWeight: 700, color: tone ?? brand.slate, lineHeight: 1.1 }}>{value}</div>
      <div className="font-medium">{label}</div>
      <Typography.Text type="secondary" className="text-xs">
        {help}
      </Typography.Text>
    </Col>
  )

  return (
    <>
      <Typography.Title level={3} className="mb-4">
        Billing runs
      </Typography.Title>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={10}>
          <Card>
            <Typography.Title level={4} style={{ marginTop: 0 }}>
              Run billing
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              Creates one invoice for every active subscription that is due, with tax and discounts filled in. It also runs by itself every day. Running it twice never bills anyone twice.
            </Typography.Paragraph>
            {DEMO_MODE && (
              <div className="mb-4">
                <div className="mb-1 font-medium">Bill as of</div>
                <DatePicker value={asOf} onChange={(d) => d && setAsOf(d)} format="D MMM YYYY" allowClear={false} style={{ width: '100%' }} />
                <Typography.Text type="secondary" className="text-xs">
                  Demo mode: pick a later date to bill every period missed up to then.
                </Typography.Text>
              </div>
            )}
            <Button type="primary" size="large" block loading={running} onClick={run}>
              Run billing now
            </Button>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card style={{ height: '100%' }}>
            {result ? (
              <>
                <Typography.Title level={4} style={{ marginTop: 0 }}>
                  Billed as of {dayjs(result.asOf).format('D MMM YYYY')}
                </Typography.Title>
                <Row gutter={16} className="my-4">
                  {stat('Created', result.created, 'New invoices, confirmed', brand.green)}
                  {stat('Skipped', result.skipped, 'Already billed for that period')}
                  {stat('Failed', result.failed, 'See the log below', result.failed ? '#B42318' : undefined)}
                </Row>
                <Space wrap>
                  {result.created > 0 && (
                    <Button onClick={() => navigate('/invoices')}>View invoices</Button>
                  )}
                  {result.created === 0 && result.skipped === 0 && result.failed === 0 && (
                    <Typography.Text type="secondary">Nothing was due. Every active subscription is billed up to date.</Typography.Text>
                  )}
                </Space>
              </>
            ) : (
              <div className="flex h-full flex-col justify-center">
                <Typography.Title level={4} style={{ marginTop: 0 }}>
                  No run yet this session
                </Typography.Title>
                <Typography.Text type="secondary">Results appear here: invoices created, periods skipped because they were already billed, and any failures.</Typography.Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Card title="History" className="mt-6">
        {history.error && <Alert className="mb-4" type="error" showIcon title={history.error} />}
        <Table<BillingRun>
          {...history.tableProps}
          columns={columns}
          scroll={{ x: 700 }}
          expandable={{
            rowExpandable: (r) => !!r.errorLog?.length,
            expandedRowRender: (r) => (
              <ul className="m-0 pl-5">
                {r.errorLog?.map((e, i) => (
                  <li key={i}>
                    <strong>{e.subscriptionNumber}</strong>: {e.message}
                  </li>
                ))}
              </ul>
            ),
          }}
          locale={{ emptyText: 'No billing runs yet.' }}
        />
      </Card>
    </>
  )
}
