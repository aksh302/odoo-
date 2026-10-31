import { FileImageOutlined, MessageOutlined, ScanOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Col,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  Progress,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { billingApi, PAYMENT_METHODS } from '../api/billing'
import { api } from '../api/client'
import { applyFieldErrors } from '../api/errors'
import { brand } from '../brand/theme'
import { formatINR } from '../lib/money'
import { drawSampleReceipt, readImageText } from '../lib/ocr'
import { matchInvoices, parsePaymentText } from '../lib/paymentParser'
import type { InvoiceMatch, ParsedPayment } from '../lib/paymentParser'
import type { Invoice, Paged, PaymentMethod } from '../lib/types'
import { MoneyInput } from './MoneyInput'

type Stage = 'input' | 'reading' | 'review'

interface Values {
  invoiceId: number
  amount: number
  date: Dayjs
  method: PaymentMethod
  reference?: string
  note?: string
}

/**
 * "Read a payment": turn a receipt photo, a UPI/bank SMS or a typed note into a
 * recorded payment. Text is read in the browser; staff confirm before saving.
 */
export function ReadPaymentDrawer({ open, onClose, onRecorded }: { open: boolean; onClose: () => void; onRecorded: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<Values>()
  const [stage, setStage] = useState<Stage>('input')
  const [pasted, setPasted] = useState('')
  const [text, setText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [parsed, setParsed] = useState<ParsedPayment | null>(null)
  const [unpaid, setUnpaid] = useState<Invoice[]>([])
  const [matches, setMatches] = useState<InvoiceMatch[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const invoiceId = Form.useWatch('invoiceId', form)
  const selected = unpaid.find((i) => i.id === invoiceId)

  useEffect(() => {
    if (!open) return
    setStage('input')
    setPasted('')
    setText('')
    setImage(null)
    setParsed(null)
    setMatches([])
    setError(null)
    api
      .get<Paged<Invoice>>('/invoices', { params: { status: 'CONFIRMED', limit: 100 } })
      .then((r) => setUnpaid(r.data.data.filter((i) => i.amountPaid < i.total)))
      .catch(() => setUnpaid([]))
  }, [open])

  /** Parse text, match invoices and pre-fill the form. */
  const review = (raw: string, source: 'photo' | 'message') => {
    const p = parsePaymentText(raw)
    const m = matchInvoices(p, raw, unpaid)
    setText(raw)
    setParsed(p)
    setMatches(m)
    form.resetFields()
    form.setFieldsValue({
      invoiceId: m[0]?.invoice.id,
      amount: p.amount,
      date: p.date ? dayjs(p.date) : dayjs(),
      method: p.method ?? 'UPI',
      reference: p.reference,
      note: source === 'photo' ? 'Read from a receipt photo' : 'Read from a payment message',
    })
    setStage('review')
  }

  const readImage = async (img: File | HTMLCanvasElement) => {
    setError(null)
    setStage('reading')
    setProgress(0)
    setImage(img instanceof HTMLCanvasElement ? img.toDataURL('image/png') : URL.createObjectURL(img))
    try {
      const raw = await readImageText(img, setProgress)
      if (!raw.trim()) throw new Error('No text found')
      review(raw, 'photo')
    } catch {
      setStage('input')
      setError('Couldn’t read any text from that image. Try a sharper, well-lit photo, or paste the message instead.')
    }
  }

  // Demo samples built from real unpaid invoices, so the match always works.
  const samples = useMemo(() => {
    const [a, b, c] = unpaid
    const name = (i?: Invoice) => i?.customerSnapshot.company || i?.customerSnapshot.name || 'Customer'
    const rs = (p: number) => (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })
    const d = dayjs()
    return {
      upi: a
        ? `Rs.${rs(a.total - a.amountPaid)} credited to A/c XX4821 on ${d.format('DD-MM-YY')} by UPI from ${name(a).toUpperCase()} (VPA ${words(name(a))}@okbank). UPI Ref No ${430912000000 + a.id}. Avl Bal Rs 2,41,880.10`
        : '',
      note: c ?? a ? `Received ${Math.round((((c ?? a)!.total - (c ?? a)!.amountPaid) / 2) / 100)} cash from ${name(c ?? a)} for ${(c ?? a)!.number} on ${d.format('DD/MM/YYYY')} - Sam` : '',
      receipt: b ?? a,
      receiptName: name(b ?? a),
      rs,
    }
  }, [unpaid])

  const save = async (v: Values) => {
    setSaving(true)
    try {
      const { invoice } = await billingApi.recordPayment({
        invoiceId: v.invoiceId,
        method: v.method,
        amount: v.amount,
        date: v.date.format('YYYY-MM-DD'),
        reference: v.reference?.trim() || undefined,
        note: v.note?.trim() || undefined,
      })
      message.success(invoice.status === 'PAID' ? `${invoice.number} is now paid` : `Payment recorded on ${invoice.number}. ${formatINR(invoice.total - invoice.amountPaid)} still due`)
      onRecorded()
    } catch (err) {
      const e = applyFieldErrors(form, err)
      if (!e.fields) message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const status = (key: keyof ParsedPayment['found']) =>
    parsed?.found[key] ? <Tag color="success">Read</Tag> : <Tag color="warning">Check</Tag>

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Read a payment"
      size={stage === 'review' ? 980 : 620}
      destroyOnHidden
      extra={
        stage === 'review' && (
          <Space>
            <Button onClick={() => setStage('input')}>Read another</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()} disabled={!unpaid.length}>
              Record payment
            </Button>
          </Space>
        )
      }
    >
      {stage === 'input' && (
        <>
          <Typography.Paragraph type="secondary">
            Add a photo of a receipt or a screenshot, or paste a bank or UPI message. Brightloop picks out the amount, date and reference, finds the invoice, and you check it before anything is saved.
          </Typography.Paragraph>
          {error && <Alert className="mb-4" type="warning" showIcon title={error} />}

          <Upload.Dragger
            accept="image/*"
            showUploadList={false}
            beforeUpload={(file) => {
              readImage(file)
              return false
            }}
          >
            <p className="ant-upload-drag-icon">
              <FileImageOutlined style={{ color: brand.green }} />
            </p>
            <p className="ant-upload-text">Drop a receipt photo or screenshot here</p>
            <p className="ant-upload-hint">or click to choose one. Printed text reads best; handwriting may need checking.</p>
          </Upload.Dragger>

          <div className="my-5 text-center">
            <Typography.Text type="secondary">or</Typography.Text>
          </div>

          <Input.TextArea
            rows={5}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'Paste an SMS, WhatsApp message, email or note, e.g.\nRs.4,557.00 credited to A/c XX4821 on 31-10-26 by UPI from CARA STORES. UPI Ref No 430912557812'}
          />
          <Button className="mt-3" type="primary" icon={<MessageOutlined />} disabled={!pasted.trim()} onClick={() => review(pasted, 'message')}>
            Read message
          </Button>

          {unpaid.length > 0 && (
            <div className="mt-8">
              <Typography.Text strong>Try a sample</Typography.Text>
              <Typography.Paragraph type="secondary" className="text-xs">
                Built from invoices that are waiting for payment right now.
              </Typography.Paragraph>
              <Space wrap>
                <Button size="small" onClick={() => setPasted(samples.upi)}>
                  UPI SMS
                </Button>
                <Button size="small" onClick={() => setPasted(samples.note)}>
                  Cash note
                </Button>
                {samples.receipt && (
                  <Button
                    size="small"
                    icon={<ScanOutlined />}
                    onClick={() => {
                      const r = samples.receipt!
                      readImage(
                        drawSampleReceipt({
                          amount: samples.rs(r.total - r.amountPaid),
                          date: dayjs().format('DD MMM YYYY'),
                          payer: samples.receiptName,
                          utr: `N30${dayjs().format('YYMMDD')}${String(r.id).padStart(8, '0')}`,
                          note: r.number,
                        }),
                      )
                    }}
                  >
                    Receipt photo
                  </Button>
                )}
              </Space>
            </div>
          )}
        </>
      )}

      {stage === 'reading' && (
        <div className="py-10 text-center">
          {image && <img src={image} alt="Receipt being read" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, border: `1px solid ${brand.line}` }} />}
          <div className="mx-auto mt-6" style={{ maxWidth: 360 }}>
            <Progress percent={Math.round(progress * 100)} strokeColor={brand.green} />
            <Typography.Text type="secondary">Reading the text… the first time takes a few seconds.</Typography.Text>
          </div>
        </div>
      )}

      {stage === 'review' && parsed && (
        <Row gutter={[24, 24]}>
          <Col xs={24} md={10}>
            {image && <img src={image} alt="Receipt" style={{ width: '100%', borderRadius: 8, border: `1px solid ${brand.line}`, marginBottom: 16 }} />}
            <Typography.Text strong>What we read</Typography.Text>
            <div
              className="mt-2 whitespace-pre-wrap text-sm"
              style={{ background: '#F7F9F8', border: `1px solid ${brand.line}`, borderRadius: 8, padding: 12, maxHeight: 320, overflow: 'auto', lineHeight: 1.6 }}
            >
              {highlight(text, Object.values(parsed.found).filter(Boolean) as string[])}
            </div>
            <Typography.Text type="secondary" className="mt-2 block text-xs">
              Highlighted parts were used to fill in the form.
            </Typography.Text>
          </Col>

          <Col xs={24} md={14}>
            <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
              <Form.Item name="invoiceId" label="Invoice" rules={[{ required: true, message: 'Choose the invoice this pays' }]}>
                {matches.length ? (
                  <Radio.Group className="w-full">
                    <Space orientation="vertical" className="w-full">
                      {matches.map((m, i) => (
                        <Radio key={m.invoice.id} value={m.invoice.id} className="w-full">
                          <span className="font-medium">{m.invoice.number}</span>{' '}
                          <Typography.Text type="secondary">
                            {m.invoice.customerSnapshot.company || m.invoice.customerSnapshot.name}, {formatINR(m.invoice.total - m.invoice.amountPaid)} due
                          </Typography.Text>
                          {i === 0 && <Tag color="success" className="ml-2">Best match</Tag>}
                          <Typography.Text type="secondary" className="block text-xs">
                            {m.reasons.join('. ')}
                          </Typography.Text>
                        </Radio>
                      ))}
                    </Space>
                  </Radio.Group>
                ) : (
                  <Select
                    showSearch={{ optionFilterProp: 'label' }}
                    placeholder="No clear match. Choose the invoice"
                    options={unpaid.map((i) => ({
                      value: i.id,
                      label: `${i.number}  ${i.customerSnapshot.company || i.customerSnapshot.name}  ${formatINR(i.total - i.amountPaid)} due`,
                    }))}
                    notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No unpaid invoices" />}
                  />
                )}
              </Form.Item>
              {matches.length > 0 && (
                <Form.Item noStyle shouldUpdate>
                  {() => (
                    <Select
                      className="mb-5 w-full"
                      size="small"
                      showSearch={{ optionFilterProp: 'label' }}
                      placeholder="Not listed? Pick another invoice"
                      value={matches.some((m) => m.invoice.id === invoiceId) ? undefined : invoiceId}
                      onChange={(v) => form.setFieldValue('invoiceId', v)}
                      options={unpaid.map((i) => ({ value: i.id, label: `${i.number}  ${i.customerSnapshot.company || i.customerSnapshot.name}` }))}
                    />
                  )}
                </Form.Item>
              )}

              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="amount"
                    label={<span>Amount {status('amount')}</span>}
                    rules={[
                      { required: true, message: 'Enter the amount' },
                      {
                        validator: (_, v?: number) =>
                          !selected || v == null || v <= selected.total - selected.amountPaid
                            ? Promise.resolve()
                            : Promise.reject(new Error(`More than the ${formatINR(selected.total - selected.amountPaid)} due`)),
                      },
                    ]}
                  >
                    <MoneyInput />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="date" label={<span>Received on {status('date')}</span>} rules={[{ required: true, message: 'Choose a date' }]}>
                    <DatePicker format="D MMM YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="method" label={<span>Method {status('method')}</span>}>
                <Segmented block options={PAYMENT_METHODS.map((m) => ({ ...m, label: m.value === 'BANK_TRANSFER' ? 'Bank' : m.label }))} />
              </Form.Item>
              <Form.Item name="reference" label={<span>Reference {status('reference')}</span>}>
                <Input placeholder="UTR, UPI reference or cheque number" />
              </Form.Item>
              <Form.Item name="note" label="Note">
                <Input />
              </Form.Item>
              {parsed.payer && (
                <Typography.Text type="secondary" className="text-xs">
                  Paid by: {parsed.payer}
                </Typography.Text>
              )}
            </Form>
          </Col>
        </Row>
      )}
      {stage === 'input' && !unpaid.length && (
        <Typography.Paragraph type="secondary" className="mt-6 text-xs">
          There are no invoices waiting for payment right now.
        </Typography.Paragraph>
      )}
    </Drawer>
  )
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14) || 'payer'

/** Wraps the parts of `text` that were used in a soft highlight. */
function highlight(text: string, parts: string[]): ReactNode {
  if (!parts.length) return text
  const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'g')
  return text.split(re).map((chunk, i) =>
    parts.includes(chunk) ? (
      <mark key={i} style={{ background: '#D6F0E3', color: 'inherit', borderRadius: 3, padding: '0 2px' }}>
        {chunk}
      </mark>
    ) : (
      chunk
    ),
  )
}

