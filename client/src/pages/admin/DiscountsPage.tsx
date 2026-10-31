import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Progress,
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
import { adminApi } from '../../api/admin'
import type { DiscountInput } from '../../api/admin'
import { applyFieldErrors, parseError } from '../../api/errors'
import { brand } from '../../brand/theme'
import { MoneyInput } from '../../components/MoneyInput'
import { useCatalog } from '../../hooks/useCatalog'
import { usePagedList } from '../../hooks/usePagedList'
import { formatINR } from '../../lib/money'
import type { Discount, Product } from '../../lib/types'

const fmt = (d: string) => dayjs(d).format('D MMM YYYY')

function state(d: Discount): { label: string; color: string } {
  const today = dayjs().format('YYYY-MM-DD')
  if (!d.isActive) return { label: 'Off', color: 'default' }
  if (d.usageLimit != null && d.usedCount >= d.usageLimit) return { label: 'Used up', color: 'default' }
  if (today < d.startDate) return { label: 'Scheduled', color: 'blue' }
  if (today > d.endDate) return { label: 'Expired', color: 'default' }
  return { label: 'Applying', color: 'green' }
}

const valueText = (d: Pick<Discount, 'type' | 'value'>) => (d.type === 'PERCENT' ? `${d.value}% off` : `${formatINR(d.value)} off`)

/** SRS 9.7 /discounts — Admin only (FR-5.3 to 5.11). Discounts apply on the next invoice by themselves. */
export default function DiscountsPage() {
  const { message } = App.useApp()
  const [search, setSearch] = useState('')
  const list = usePagedList<Discount>('/discounts', { q: search })
  const { products } = useCatalog({ availableOnly: false })
  const [editing, setEditing] = useState<Discount | 'new' | null>(null)

  const toggle = async (d: Discount) => {
    try {
      await adminApi.updateDiscount(d.id, { isActive: !d.isActive })
      message.success(d.isActive ? 'Discount turned off' : 'Discount turned on')
      list.reload()
    } catch (err) {
      message.error(parseError(err).message)
    }
  }

  const appliesTo = (d: Discount) =>
    d.scope === 'SUBSCRIPTION'
      ? 'Whole subscription'
      : d.productIds.map((id) => products.find((p) => p.id === id)?.name ?? `#${id}`).join(', ')

  const columns: ColumnsType<Discount> = [
    {
      title: 'Discount',
      render: (_, d) => (
        <span>
          <Typography.Link onClick={() => setEditing(d)}>{d.name}</Typography.Link>
          <Typography.Text type="secondary" className="block text-xs">
            {valueText(d)}
          </Typography.Text>
        </span>
      ),
    },
    { title: 'Applies to', render: (_, d) => appliesTo(d) },
    {
      title: 'When',
      render: (_, d) => {
        const rules = [d.minQty ? `${d.minQty}+ units` : null, d.minPurchase ? `${formatINR(d.minPurchase)}+ spend` : null].filter(Boolean)
        return rules.length ? rules.join(', ') : <Typography.Text type="secondary">Always</Typography.Text>
      },
    },
    {
      title: 'Valid',
      render: (_, d) => {
        const s = state(d)
        return (
          <span>
            <Tag color={s.color}>{s.label}</Tag>
            <Typography.Text type="secondary" className="block whitespace-nowrap text-xs">
              {fmt(d.startDate)} – {fmt(d.endDate)}
            </Typography.Text>
          </span>
        )
      },
    },
    {
      title: 'Used',
      render: (_, d) =>
        d.usageLimit ? (
          <div style={{ minWidth: 110 }}>
            <span className="text-sm">
              {d.usedCount} of {d.usageLimit}
            </span>
            <Progress percent={Math.round((d.usedCount / d.usageLimit) * 100)} showInfo={false} size="small" strokeColor={brand.green} aria-label={`${d.usedCount} of ${d.usageLimit} uses`} />
          </div>
        ) : (
          <span className="text-sm">{d.usedCount} times, no limit</span>
        ),
    },
    {
      title: 'On',
      align: 'center',
      render: (_, d) => (
        <Popconfirm
          title={d.isActive ? 'Turn this discount off?' : 'Turn this discount on?'}
          description={d.isActive ? 'It stops applying to new invoices. Existing invoices keep it.' : undefined}
          onConfirm={() => toggle(d)}
        >
          <Switch size="small" checked={d.isActive} aria-label={`${d.name} on`} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Typography.Title level={3}>Discounts</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
          New discount
        </Button>
      </div>
      <Card>
        <Typography.Paragraph type="secondary">
          The billing run applies discounts by itself. Each invoice line gets at most one discount, the biggest that qualifies, until the discount expires or its usage limit is reached.
        </Typography.Paragraph>
        <Input
          className="mb-4 max-w-xs"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search discounts"
            aria-label="Search discounts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {list.error && <Alert className="mb-4" type="error" showIcon title={list.error} />}
        <Table<Discount> {...list.tableProps} columns={columns} scroll={{ x: 960 }} locale={{ emptyText: 'No discounts yet.' }} />
      </Card>
      <DiscountDrawer
        target={editing}
        products={products}
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

type FormValues = Omit<DiscountInput, 'startDate' | 'endDate'> & { dates: [Dayjs, Dayjs] }

function DiscountDrawer({
  target,
  products,
  onClose,
  onSaved,
}: {
  target: Discount | 'new' | null
  products: Product[]
  onClose: () => void
  onSaved: () => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)
  const discount = target && target !== 'new' ? target : null
  const type = Form.useWatch('type', form)
  const scope = Form.useWatch('scope', form)
  const value = Form.useWatch('value', form)

  useEffect(() => {
    if (!target) return
    form.resetFields()
    form.setFieldsValue(
      discount
        ? { ...discount, dates: [dayjs(discount.startDate), dayjs(discount.endDate)] }
        : { type: 'PERCENT', scope: 'PRODUCT', productIds: [], value: 10, dates: [dayjs(), dayjs().add(3, 'month')] },
    )
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async ({ dates, ...v }: FormValues) => {
    setSaving(true)
    const input: DiscountInput = {
      ...v,
      name: v.name.trim(),
      productIds: v.scope === 'PRODUCT' ? v.productIds : [],
      minQty: v.minQty || null,
      minPurchase: v.minPurchase || null,
      usageLimit: v.usageLimit || null,
      startDate: dates[0].format('YYYY-MM-DD'),
      endDate: dates[1].format('YYYY-MM-DD'),
    }
    try {
      if (discount) await adminApi.updateDiscount(discount.id, input)
      else await adminApi.createDiscount(input)
      message.success(discount ? 'Discount saved' : 'Discount created. It applies from the next billing run.')
      onSaved()
    } catch (err) {
      const e = applyFieldErrors(form, err)
      if (e.fields?.endDate) form.setFields([{ name: 'dates', errors: [e.fields.endDate] }])
      if (!e.fields) message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={!!target}
      onClose={onClose}
      title={discount ? `Edit ${discount.name}` : 'New discount'}
      size={560}
      destroyOnHidden
      extra={
        <Button type="primary" loading={saving} onClick={() => form.submit()}>
          {discount ? 'Save' : 'Create'}
        </Button>
      }
    >
      {discount && discount.usedCount > 0 && (
        <Alert
          className="mb-4"
          type="info"
          showIcon
          title={`Used ${discount.usedCount} time${discount.usedCount === 1 ? '' : 's'}. Changes apply to future invoices only.`}
        />
      )}
      <Form form={form} layout="vertical" onFinish={save} requiredMark="optional">
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter a name' }]}>
          <Input placeholder="e.g. Volume seats 10%" />
        </Form.Item>

        <Form.Item name="type" label="Type">
          <Segmented
            block
            options={[
              { value: 'PERCENT', label: 'Percentage' },
              { value: 'FIXED', label: 'Fixed amount' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="value"
          label={type === 'FIXED' ? 'Amount off' : 'Percent off'}
          rules={[
            { required: true, message: 'Enter a value' },
            {
              validator: (_, v?: number) =>
                v == null || (type === 'PERCENT' ? v >= 1 && v <= 100 && Number.isInteger(v) : v > 0)
                  ? Promise.resolve()
                  : Promise.reject(new Error(type === 'PERCENT' ? 'A whole percent from 1 to 100' : 'Above 0')),
            },
          ]}
          extra={value ? `Shows on invoices as "${valueText({ type: type ?? 'PERCENT', value })}"` : undefined}
        >
          {type === 'FIXED' ? <MoneyInput /> : <InputNumber min={1} max={100} precision={0} suffix="%" style={{ width: '100%' }} />}
        </Form.Item>

        <Form.Item name="scope" label="Applies to">
          <Segmented
            block
            options={[
              { value: 'PRODUCT', label: 'Specific products' },
              { value: 'SUBSCRIPTION', label: 'Whole subscription' },
            ]}
          />
        </Form.Item>
        {scope === 'PRODUCT' ? (
          <Form.Item name="productIds" label="Products" rules={[{ required: true, type: 'array', min: 1, message: 'Choose at least one product' }]}>
            <Select mode="multiple" placeholder="Choose products" options={products.map((p) => ({ value: p.id, label: p.name }))} showSearch={{ optionFilterProp: 'label' }} />
          </Form.Item>
        ) : (
          <Typography.Paragraph type="secondary" className="-mt-2">
            The amount is shared across all lines of the invoice, in proportion to each line.
          </Typography.Paragraph>
        )}

        <Typography.Text strong>Only when</Typography.Text>
        <Row gutter={12} className="mt-2">
          <Col xs={24} sm={12}>
            <Form.Item name="minQty" label={scope === 'PRODUCT' ? 'Line quantity at least' : 'Total quantity at least'}>
              <InputNumber min={1} precision={0} placeholder="Any" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="minPurchase" label="Spend at least">
              <MoneyInput placeholder="Any" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="dates"
          label="Valid from – to"
          rules={[
            { required: true, message: 'Choose the dates' },
            {
              validator: (_, d?: [Dayjs, Dayjs]) =>
                !d || !d[1].isBefore(d[0], 'day') ? Promise.resolve() : Promise.reject(new Error('End must be on or after the start')),
            },
          ]}
        >
          <DatePicker.RangePicker format="D MMM YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="usageLimit" label="Usage limit" extra="How many invoices it can apply to. Leave empty for no limit.">
          <InputNumber min={1} precision={0} placeholder="No limit" style={{ width: '100%' }} />
        </Form.Item>
      </Form>
      <Space />
    </Drawer>
  )
}
