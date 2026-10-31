import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { catalogApi } from '../api/catalog'
import type { PlanInput } from '../api/catalog'
import { applyFieldErrors, parseError } from '../api/errors'
import { useIsAdmin } from '../auth/AuthContext'
import { MoneyInput } from '../components/MoneyInput'
import { usePagedList } from '../hooks/usePagedList'
import { formatINR } from '../lib/money'
import type { BillingPeriod, Plan } from '../lib/types'

export const PERIOD_LABEL: Record<BillingPeriod, string> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
}
const PERIOD_OPTIONS = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
]

// FR-3.2 lifecycle flags, with plain-English help for the form.
const FLAGS = [
  { key: 'autoClose', label: 'Auto-close', help: 'Subscriptions close by themselves when the plan ends' },
  { key: 'closable', label: 'Close early', help: 'Subscriptions can be closed before they expire' },
  { key: 'pausable', label: 'Pause', help: 'Subscriptions can be paused and resumed' },
  { key: 'renewable', label: 'Renew', help: 'Subscriptions can be renewed for another term' },
] as const

const fmtDate = (d: string) => dayjs(d).format('D MMM YYYY')

function availability(p: Plan): { label: string; color: string } {
  if (p.isArchived) return { label: 'Archived', color: 'default' }
  const today = dayjs().format('YYYY-MM-DD')
  if (today < p.startDate) return { label: 'Upcoming', color: 'blue' }
  if (today > p.endDate) return { label: 'Ended', color: 'default' }
  return { label: 'Available', color: 'green' }
}

/** SRS 9.7 /plans — Admin edits, Staff reads. FR-3.1 to FR-3.6. */
export default function PlansPage() {
  const isAdmin = useIsAdmin()
  const { message } = App.useApp()
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<BillingPeriod | undefined>()
  const [availableOnly, setAvailableOnly] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const list = usePagedList<Plan>('/plans', {
    q: search,
    billingPeriod: period,
    available: availableOnly || undefined,
    archived: showArchived || undefined,
  })
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)

  const toggleArchive = async (p: Plan) => {
    try {
      await catalogApi.updatePlan(p.id, { isArchived: !p.isArchived })
      message.success(p.isArchived ? 'Plan restored' : 'Plan archived')
      list.reload()
    } catch (err) {
      message.error(parseError(err).message)
    }
  }

  const columns: ColumnsType<Plan> = [
    {
      title: 'Plan',
      render: (_, p) =>
        isAdmin ? <Typography.Link onClick={() => setEditing(p)}>{p.name}</Typography.Link> : p.name,
    },
    {
      title: 'Price',
      align: 'right',
      render: (_, p) => (
        <span className="whitespace-nowrap">
          <strong>{formatINR(p.price)}</strong>
          <Typography.Text type="secondary"> / {PERIOD_LABEL[p.billingPeriod]}</Typography.Text>
        </span>
      ),
    },
    { title: 'Min qty', dataIndex: 'minQty', align: 'center' },
    {
      title: 'Availability',
      render: (_, p) => {
        const a = availability(p)
        return (
          <Space orientation="vertical" size={0}>
            <Tag color={a.color}>{a.label}</Tag>
            <Typography.Text type="secondary" className="whitespace-nowrap text-xs">
              {fmtDate(p.startDate)} – {fmtDate(p.endDate)}
            </Typography.Text>
          </Space>
        )
      },
    },
    {
      title: 'Allows',
      render: (_, p) => {
        const on = FLAGS.filter((f) => p[f.key])
        return on.length ? (
          <Space size={[4, 4]} wrap>
            {on.map((f) => (
              <Tag key={f.key} title={f.help}>
                {f.label}
              </Tag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
      },
    },
    ...(isAdmin
      ? [
          {
            title: '',
            align: 'right' as const,
            render: (_: unknown, p: Plan) => (
              <Space>
                <Button size="small" onClick={() => setEditing(p)}>
                  Edit
                </Button>
                <Popconfirm
                  title={p.isArchived ? 'Restore this plan?' : 'Archive this plan?'}
                  description={p.isArchived ? undefined : 'No new subscriptions can use it. Existing ones keep running.'}
                  onConfirm={() => toggleArchive(p)}
                  okButtonProps={{ danger: !p.isArchived }}
                  okText={p.isArchived ? 'Restore' : 'Archive'}
                >
                  <Button size="small" type="text">
                    {p.isArchived ? 'Restore' : 'Archive'}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Typography.Title level={3} style={{ margin: 0 }}>
          Plans
        </Typography.Title>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            New plan
          </Button>
        )}
      </div>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Input
            className="max-w-xs"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search plans"
            aria-label="Search plans"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            allowClear
            placeholder="Any period"
            aria-label="Any period"
            style={{ width: 150 }}
            options={PERIOD_OPTIONS}
            value={period}
            onChange={setPeriod}
          />
          <Space>
            <Switch id="plans-available" size="small" checked={availableOnly} onChange={setAvailableOnly} aria-label="Available today" />
            <label htmlFor="plans-available" className="cursor-pointer select-none">Available today</label>
          </Space>
          <Space>
            <Switch id="plans-archived" size="small" checked={showArchived} onChange={setShowArchived} aria-label="Show archived" />
            <label htmlFor="plans-archived" className="cursor-pointer select-none">Show archived</label>
          </Space>
        </div>
        {list.error && <Alert className="mb-4" type="error" showIcon title={list.error} />}
        <Table<Plan> {...list.tableProps} columns={columns} scroll={{ x: 900 }} />
      </Card>

      <PlanModal
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          list.reload()
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------

type PlanForm = Omit<PlanInput, 'startDate' | 'endDate'> & { dates: [Dayjs, Dayjs] }

function PlanModal({
  target,
  onClose,
  onSaved,
}: {
  target: Plan | 'new' | null
  onClose: () => void
  onSaved: () => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<PlanForm>()
  const [saving, setSaving] = useState(false)
  const plan = target && target !== 'new' ? target : null
  const price = Form.useWatch('price', form)
  const period = Form.useWatch('billingPeriod', form)

  useEffect(() => {
    if (!target) return
    form.resetFields()
    if (plan) {
      form.setFieldsValue({ ...plan, dates: [dayjs(plan.startDate), dayjs(plan.endDate)] })
    } else {
      form.setFieldsValue({
        billingPeriod: 'MONTHLY',
        minQty: 1,
        price: 0,
        dates: [dayjs(), dayjs().add(1, 'year')],
        autoClose: false,
        closable: true,
        pausable: true,
        renewable: true,
      })
    }
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async ({ dates, ...v }: PlanForm) => {
    setSaving(true)
    const input: PlanInput = {
      ...v,
      name: v.name.trim(),
      startDate: dates[0].format('YYYY-MM-DD'),
      endDate: dates[1].format('YYYY-MM-DD'),
    }
    try {
      if (plan) await catalogApi.updatePlan(plan.id, input)
      else await catalogApi.createPlan(input)
      message.success(plan ? 'Plan saved' : 'Plan created')
      onSaved()
    } catch (err) {
      const e = applyFieldErrors(form, err)
      // API reports date problems on startDate/endDate; show them on the range picker.
      if (e.fields?.endDate || e.fields?.startDate) {
        form.setFields([{ name: 'dates', errors: [e.fields.endDate ?? e.fields.startDate] }])
      }
      if (!e.fields) message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={!!target}
      title={plan ? `Edit ${plan.name}` : 'New plan'}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={plan ? 'Save' : 'Create'}
      confirmLoading={saving}
      width={600}
      destroyOnHidden
    >
      {plan && (
        <Alert
          className="mb-4"
          type="info"
          showIcon
          title="Changes apply to new subscriptions only. Existing subscriptions keep their current price and terms."
        />
      )}
      <Form form={form} layout="vertical" onFinish={save} requiredMark="optional">
        <Form.Item name="name" label="Plan name" rules={[{ required: true, whitespace: true, message: 'Enter a name' }]}>
          <Input placeholder="e.g. Business Monthly" />
        </Form.Item>

        <Form.Item name="billingPeriod" label="Bills every" rules={[{ required: true }]}>
          <Segmented block options={PERIOD_OPTIONS} />
        </Form.Item>

        <Row gutter={12}>
          <Col xs={24} sm={14}>
            <Form.Item
              name="price"
              label="Price per period"
              rules={[{ required: true, message: 'Enter a price' }]}
              extra={price != null && period ? `${formatINR(price)} every ${PERIOD_LABEL[period as BillingPeriod]}` : undefined}
            >
              <MoneyInput />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item
              name="minQty"
              label="Minimum quantity"
              rules={[{ required: true, type: 'integer', min: 1, message: 'At least 1' }]}
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="dates"
          label="Available from – to"
          rules={[
            { required: true, message: 'Choose the dates' },
            {
              validator: (_, d?: [Dayjs, Dayjs]) =>
                !d || d[1].isAfter(d[0], 'day')
                  ? Promise.resolve()
                  : Promise.reject(new Error('End date must be after start date')),
            },
          ]}
        >
          <DatePicker.RangePicker style={{ width: '100%' }} format="D MMM YYYY" />
        </Form.Item>

        <Typography.Text strong>Subscriptions on this plan can…</Typography.Text>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {FLAGS.map((f) => (
            <Card key={f.key} size="small">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{f.label}</div>
                  <Typography.Text type="secondary" className="text-xs">
                    {f.help}
                  </Typography.Text>
                </div>
                <Form.Item name={f.key} valuePropName="checked" noStyle>
                  <Switch size="small" />
                </Form.Item>
              </div>
            </Card>
          ))}
        </div>
      </Form>
    </Modal>
  )
}
