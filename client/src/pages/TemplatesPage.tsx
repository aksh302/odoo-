import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Drawer, Form, Input, InputNumber, Row, Select, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { applyFieldErrors } from '../api/errors'
import { subscriptionsApi } from '../api/subscriptions'
import type { TemplateInput } from '../api/subscriptions'
import { InvoiceEstimate } from '../components/InvoiceEstimate'
import { LinesEditor } from '../components/LinesEditor'
import type { LineValue } from '../components/LinesEditor'
import { useCatalog } from '../hooks/useCatalog'
import { usePagedList } from '../hooks/usePagedList'
import { PERIOD_WORD } from '../lib/labels'
import { formatINR } from '../lib/money'
import type { QuotationTemplate } from '../lib/types'

/** SRS 9.7 /templates — reusable starting offers (FR-4.1). Admin and Staff. */
export default function TemplatesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const list = usePagedList<QuotationTemplate>('/templates', { q: search })
  const [open, setOpen] = useState<QuotationTemplate | 'new' | null>(null)

  const columns: ColumnsType<QuotationTemplate> = [
    {
      title: 'Template',
      render: (_, t) => <Typography.Link onClick={() => setOpen(t)}>{t.name}</Typography.Link>,
    },
    {
      title: 'Plan',
      render: (_, t) =>
        t.plan ? (
          <span>
            {t.plan.name}
            <Typography.Text type="secondary">
              {' '}
              {formatINR(t.plan.price)} / {PERIOD_WORD[t.plan.billingPeriod]}
            </Typography.Text>
          </span>
        ) : (
          '—'
        ),
    },
    {
      title: 'Products',
      render: (_, t) =>
        t.lines
          .map((l) => `${l.quantity} × ${l.product?.name ?? 'Product'}${l.variant ? ` (${l.variant.value})` : ''}`)
          .join(', '),
    },
    { title: 'Quote valid for', align: 'right', render: (_, t) => `${t.validityDays} days` },
    {
      title: '',
      align: 'right',
      render: (_, t) => (
        <Button size="small" onClick={() => navigate(`/subscriptions/new?template=${t.id}`)}>
          Use for new subscription
        </Button>
      ),
    },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Typography.Title level={3}>Quotation templates</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen('new')}>
          New template
        </Button>
      </div>
      <Card>
        <Input
          className="mb-4 max-w-sm"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search templates"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {list.error && <Alert className="mb-4" type="error" showIcon title={list.error} />}
        <Table<QuotationTemplate> {...list.tableProps} columns={columns} scroll={{ x: 900 }} />
      </Card>
      <TemplateDrawer
        target={open}
        onClose={() => setOpen(null)}
        onSaved={() => {
          setOpen(null)
          list.reload()
        }}
      />
    </>
  )
}

function TemplateDrawer({
  target,
  onClose,
  onSaved,
}: {
  target: QuotationTemplate | 'new' | null
  onClose: () => void
  onSaved: () => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<TemplateInput>()
  const { products, plans } = useCatalog({ availableOnly: false })
  const [saving, setSaving] = useState(false)
  const tpl = target && target !== 'new' ? target : null
  const planId = Form.useWatch('planId', form)
  const lines: LineValue[] = Form.useWatch('lines', form) ?? []
  const plan = plans.find((p) => p.id === planId)

  useEffect(() => {
    if (!target) return
    form.resetFields()
    form.setFieldsValue(
      tpl
        ? {
            name: tpl.name,
            planId: tpl.planId,
            validityDays: tpl.validityDays,
            lines: tpl.lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? null, quantity: l.quantity })),
          }
        : { validityDays: 15, lines: [] },
    )
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (v: TemplateInput) => {
    setSaving(true)
    try {
      const input = { ...v, name: v.name.trim() }
      if (tpl) await subscriptionsApi.updateTemplate(tpl.id, input)
      else await subscriptionsApi.createTemplate(input)
      message.success(tpl ? 'Template saved' : 'Template created')
      onSaved()
    } catch (err) {
      const e = applyFieldErrors(form, err)
      if (!e.fields) message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={!!target}
      onClose={onClose}
      title={tpl ? `Edit ${tpl.name}` : 'New quotation template'}
      size={760}
      destroyOnHidden
      extra={
        <Button type="primary" loading={saving} onClick={() => form.submit()}>
          {tpl ? 'Save' : 'Create'}
        </Button>
      }
    >
      <Form form={form} layout="vertical" onFinish={save} requiredMark="optional">
        <Row gutter={12}>
          <Col xs={24} sm={14}>
            <Form.Item name="name" label="Template name" rules={[{ required: true, whitespace: true, message: 'Enter a name' }]}>
              <Input placeholder="e.g. Enterprise yearly bundle" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item
              name="validityDays"
              label="Quote valid for"
              rules={[{ required: true, type: 'integer', min: 1, message: 'At least 1 day' }]}
            >
              <InputNumber min={1} precision={0} suffix="days" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="planId" label="Plan" rules={[{ required: true, message: 'Choose a plan' }]}>
          <Select
            placeholder="Choose a plan"
            options={plans
              .filter((p) => !p.isArchived)
              .map((p) => ({ value: p.id, label: `${p.name}  ${formatINR(p.price)} / ${PERIOD_WORD[p.billingPeriod]}` }))}
          />
        </Form.Item>

        <Typography.Title level={5}>Products</Typography.Title>
        {plan && plan.minQty > 1 && (
          <Typography.Paragraph type="secondary">This plan needs at least {plan.minQty} of each product.</Typography.Paragraph>
        )}
        <LinesEditor products={products} minQty={plan?.minQty ?? 1} />

        <Card size="small" className="mt-6" style={{ background: '#F7F9F8' }}>
          <InvoiceEstimate plan={plan} lines={lines} products={products} />
        </Card>
      </Form>
    </Drawer>
  )
}
