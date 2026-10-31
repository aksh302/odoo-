import { ArrowLeftOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, DatePicker, Form, InputNumber, Row, Select, Skeleton, Typography } from 'antd'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { applyFieldErrors, parseError } from '../api/errors'
import { subscriptionsApi } from '../api/subscriptions'
import type { SubscriptionInput } from '../api/subscriptions'
import { CustomerSelect } from '../components/CustomerSelect'
import { InvoiceEstimate } from '../components/InvoiceEstimate'
import { LinesEditor } from '../components/LinesEditor'
import type { LineValue } from '../components/LinesEditor'
import { useCatalog } from '../hooks/useCatalog'
import { PERIOD_WORD } from '../lib/labels'
import { formatINR } from '../lib/money'
import type { Paged, QuotationTemplate, Subscription } from '../lib/types'

interface FormValues {
  templateId?: number
  customerId: number
  planId: number
  startDate: Dayjs
  expiryDate: Dayjs
  paymentTerms: number
  lines: LineValue[]
}

/**
 * SRS 9.7 /subscriptions/new and /subscriptions/:id/edit.
 * New subscriptions are saved as Draft; edits are only allowed while Draft or Quotation.
 */
export default function SubscriptionFormPage() {
  const { id } = useParams()
  const editingId = id ? Number(id) : null
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const { products, plans, loading } = useCatalog({ availableOnly: false })
  const [templates, setTemplates] = useState<QuotationTemplate[]>([])
  const [existing, setExisting] = useState<Subscription | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [expiryTouched, setExpiryTouched] = useState(false)

  const planId = Form.useWatch('planId', form)
  const lines: LineValue[] = Form.useWatch('lines', form) ?? []
  const plan = plans.find((p) => p.id === planId)
  const today = dayjs().format('YYYY-MM-DD')

  // Only plans selectable today (FR-3.3), plus the current one when editing.
  const planOptions = useMemo(
    () =>
      plans
        .filter((p) => (!p.isArchived && p.startDate <= today && today <= p.endDate) || p.id === existing?.planId)
        .map((p) => ({ value: p.id, label: `${p.name}  ${formatINR(p.price)} / ${PERIOD_WORD[p.billingPeriod]}` })),
    [plans, existing, today],
  )

  useEffect(() => {
    api
      .get<Paged<QuotationTemplate>>('/templates', { params: { limit: 100 } })
      .then((r) => setTemplates(r.data.data))
      .catch(() => setTemplates([]))
  }, [])

  // Load existing subscription for edit, or start a fresh draft.
  useEffect(() => {
    if (editingId) {
      subscriptionsApi
        .get(editingId)
        .then(({ subscription: s, lines }) => {
          if (s.status !== 'DRAFT' && s.status !== 'QUOTATION') {
            setLoadError(`${s.number} is ${s.status.toLowerCase()} and can no longer be edited.`)
            return
          }
          setExisting(s)
          setExpiryTouched(true)
          form.setFieldsValue({
            customerId: s.customerId,
            planId: s.planId,
            startDate: dayjs(s.startDate),
            expiryDate: dayjs(s.expiryDate),
            paymentTerms: s.paymentTerms,
            lines: lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? null, quantity: l.quantity })),
          })
        })
        .catch((err) => setLoadError(parseError(err).message))
    } else {
      const start = dayjs().add(1, 'day')
      form.setFieldsValue({ startDate: start, expiryDate: start.add(1, 'year'), paymentTerms: 15, lines: [] })
    }
  }, [editingId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ?template=ID from the templates page
  useEffect(() => {
    const t = Number(params.get('template'))
    if (!editingId && t && templates.length) applyTemplate(t)
  }, [templates]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyTemplate(templateId?: number) {
    const t = templates.find((x) => x.id === templateId)
    if (!t) return
    form.setFieldsValue({
      templateId: t.id,
      planId: t.planId,
      lines: t.lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? null, quantity: l.quantity })),
    })
  }

  const save = async (v: FormValues) => {
    setSaving(true)
    const input: SubscriptionInput = {
      customerId: v.customerId,
      planId: v.planId,
      startDate: v.startDate.format('YYYY-MM-DD'),
      expiryDate: v.expiryDate.format('YYYY-MM-DD'),
      paymentTerms: v.paymentTerms,
      templateId: v.templateId,
      lines: v.lines.map((l) => ({ productId: l.productId!, variantId: l.variantId ?? null, quantity: l.quantity! })),
    }
    try {
      const saved = editingId ? await subscriptionsApi.update(editingId, input) : await subscriptionsApi.create(input)
      message.success(editingId ? 'Changes saved' : `${saved.number} saved as a draft`)
      navigate(`/subscriptions/${saved.id}`)
    } catch (err) {
      const e = applyFieldErrors(form, err)
      message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <Alert
        type="warning"
        showIcon
        title={loadError}
        action={<Button onClick={() => navigate(`/subscriptions/${editingId}`)}>Back to subscription</Button>}
      />
    )
  }

  return (
    <>
      <Button type="link" icon={<ArrowLeftOutlined />} className="mb-2 px-0" onClick={() => navigate(-1)}>
        Back
      </Button>
      <Typography.Title level={3} className="mb-6">
        {existing ? `Edit ${existing.number}` : 'New subscription'}
      </Typography.Title>

      {loading ? (
        <Skeleton active />
      ) : (
        <Form form={form} layout="vertical" onFinish={save} requiredMark="optional">
          <Row gutter={[24, 24]}>
            <Col xs={24} xl={16}>
              <Card title="Customer and plan" className="mb-6">
                {!existing && templates.length > 0 && (
                  <Form.Item
                    name="templateId"
                    label="Start from a template"
                    extra="Fills in the plan and products. You can still change them."
                  >
                    <Select
                      allowClear
                      placeholder="Start from scratch"
                      options={templates.map((t) => ({ value: t.id, label: t.name }))}
                      onChange={(v) => applyTemplate(v)}
                    />
                  </Form.Item>
                )}
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Choose a customer' }]}>
                      <CustomerSelect
                        initial={existing?.customer ? { id: existing.customer.id, name: existing.customer.name, company: existing.customer.company } : undefined}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="planId"
                      label="Plan"
                      rules={[{ required: true, message: 'Choose a plan' }]}
                      extra={plan ? `Bills every ${PERIOD_WORD[plan.billingPeriod]}; at least ${plan.minQty} of each product` : 'Only plans available today are listed'}
                    >
                      <Select placeholder="Choose a plan" options={planOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item name="startDate" label="Starts on" rules={[{ required: true, message: 'Choose a date' }]}>
                      <DatePicker
                        format="D MMM YYYY"
                        style={{ width: '100%' }}
                        onChange={(d) => {
                          if (d && !expiryTouched) form.setFieldValue('expiryDate', d.add(1, 'year'))
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item
                      name="expiryDate"
                      label="Expires on"
                      dependencies={['startDate']}
                      rules={[
                        { required: true, message: 'Choose a date' },
                        ({ getFieldValue }) => ({
                          validator: (_, d?: Dayjs) => {
                            const s: Dayjs | undefined = getFieldValue('startDate')
                            return !d || !s || d.isAfter(s, 'day')
                              ? Promise.resolve()
                              : Promise.reject(new Error('Must be after the start date'))
                          },
                        }),
                      ]}
                    >
                      <DatePicker format="D MMM YYYY" style={{ width: '100%' }} onChange={() => setExpiryTouched(true)} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Form.Item
                      name="paymentTerms"
                      label="Payment due within"
                      tooltip="Each invoice is due this many days after its period starts"
                      rules={[{ required: true, type: 'integer', min: 0, message: '0 or more days' }]}
                    >
                      <InputNumber min={0} precision={0} suffix="days" style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card title="Products">
                <LinesEditor products={products} minQty={plan?.minQty ?? 1} />
              </Card>
            </Col>

            <Col xs={24} xl={8}>
              <div style={{ position: 'sticky', top: 24 }}>
                <Card title="Each invoice">
                  <InvoiceEstimate plan={plan} lines={lines} products={products} />
                  <Button type="primary" block size="large" className="mt-5" loading={saving} htmlType="submit">
                    {existing ? 'Save changes' : 'Save as draft'}
                  </Button>
                  {!existing && (
                    <Typography.Paragraph type="secondary" className="mt-3 mb-0 text-xs">
                      You can send it as a quotation from the next screen.
                    </Typography.Paragraph>
                  )}
                </Card>
              </div>
            </Col>
          </Row>
        </Form>
      )}
    </>
  )
}
