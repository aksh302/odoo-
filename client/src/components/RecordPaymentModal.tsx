import { App, Col, DatePicker, Form, Input, Modal, Row, Segmented, Typography } from 'antd'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { billingApi, PAYMENT_METHODS } from '../api/billing'
import { applyFieldErrors } from '../api/errors'
import { formatINR } from '../lib/money'
import type { Invoice, PaymentMethod } from '../lib/types'
import { MoneyInput } from './MoneyInput'

interface Values {
  method: PaymentMethod
  amount: number
  date: Dayjs
  reference?: string
  note?: string
}

/**
 * Record a payment against a confirmed invoice (FR-7.1 to 7.7).
 * Amount defaults to the full balance; partial payments are allowed.
 */
export function RecordPaymentModal({
  invoice,
  onClose,
  onRecorded,
}: {
  invoice: Invoice | null
  onClose: () => void
  onRecorded: (updated: Invoice) => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<Values>()
  const [saving, setSaving] = useState(false)
  const balance = invoice ? invoice.total - invoice.amountPaid : 0
  const amount = Form.useWatch('amount', form)

  useEffect(() => {
    if (!invoice) return
    form.resetFields()
    form.setFieldsValue({ method: 'UPI', amount: balance, date: dayjs() })
  }, [invoice]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (v: Values) => {
    if (!invoice) return
    setSaving(true)
    try {
      const { invoice: updated } = await billingApi.recordPayment({
        invoiceId: invoice.id,
        method: v.method,
        amount: v.amount,
        date: v.date.format('YYYY-MM-DD'),
        reference: v.reference?.trim() || undefined,
        note: v.note?.trim() || undefined,
      })
      message.success(updated.status === 'PAID' ? `${invoice.number} is now paid` : `Payment recorded. ${formatINR(updated.total - updated.amountPaid)} still due`)
      onRecorded(updated)
    } catch (err) {
      const e = applyFieldErrors(form, err)
      if (!e.fields) message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const remaining = balance - (amount ?? 0)

  return (
    <Modal
      open={!!invoice}
      title={invoice ? `Record payment for ${invoice.number}` : ''}
      okText="Record payment"
      onOk={() => form.submit()}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnHidden
    >
      {invoice && (
        <Typography.Paragraph type="secondary">
          {invoice.customerSnapshot.company || invoice.customerSnapshot.name}. Balance due {formatINR(balance)} of {formatINR(invoice.total)}.
        </Typography.Paragraph>
      )}
      <Form form={form} layout="vertical" onFinish={save} requiredMark="optional">
        <Form.Item name="method" label="Method" rules={[{ required: true }]}>
          <Segmented block options={PAYMENT_METHODS} />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="amount"
              label="Amount"
              rules={[
                { required: true, message: 'Enter an amount' },
                {
                  validator: (_, v?: number) =>
                    v == null || (v > 0 && v <= balance)
                      ? Promise.resolve()
                      : Promise.reject(new Error(v && v > balance ? `More than the ${formatINR(balance)} due` : 'Must be above 0')),
                },
              ]}
              extra={amount != null && amount > 0 && amount < balance ? `Part payment. ${formatINR(remaining)} will still be due.` : undefined}
            >
              <MoneyInput />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="date" label="Received on" rules={[{ required: true, message: 'Choose a date' }]}>
              <DatePicker format="D MMM YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="reference" label="Reference" tooltip="Transaction ID, UTR or cheque number">
          <Input placeholder="e.g. UTR 4012 8899 1201" />
        </Form.Item>
        <Form.Item name="note" label="Note">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
