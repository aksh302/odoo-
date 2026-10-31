import { App, Button, Col, Drawer, Form, Input, Row, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { adminApi } from '../api/admin'
import type { CustomerInput } from '../api/admin'
import { applyFieldErrors } from '../api/errors'
import type { User } from '../lib/types'

/** Create or edit a customer and their billing profile (FR-1.10, FR-1.11). */
export function CustomerDrawer({
  target,
  onClose,
  onSaved,
}: {
  target: User | 'new' | null
  onClose: () => void
  onSaved: (c: User) => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<CustomerInput>()
  const [saving, setSaving] = useState(false)
  const customer = target && target !== 'new' ? target : null

  useEffect(() => {
    if (!target) return
    form.resetFields()
    if (customer) form.setFieldsValue({ name: customer.name, email: customer.email, ...customer.profile })
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (v: CustomerInput) => {
    setSaving(true)
    const input: CustomerInput = {
      name: v.name.trim(),
      email: v.email.trim().toLowerCase(),
      company: v.company?.trim() || null,
      phone: v.phone?.trim() || null,
      billingAddress: v.billingAddress?.trim() || null,
      taxId: v.taxId?.trim().toUpperCase() || null,
    }
    try {
      const saved = customer ? await adminApi.updateCustomer(customer.id, input) : await adminApi.createCustomer(input)
      message.success(customer ? 'Customer saved' : `${saved.name} added. They’ll get an email to set their password.`)
      onSaved(saved)
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
      title={customer ? `Edit ${customer.name}` : 'New customer'}
      size={520}
      destroyOnHidden
      extra={
        <Button type="primary" loading={saving} onClick={() => form.submit()}>
          {customer ? 'Save' : 'Add customer'}
        </Button>
      }
    >
      {!customer && (
        <Typography.Paragraph type="secondary">
          They’ll receive an email to set a password, then they can use the customer portal.
        </Typography.Paragraph>
      )}
      <Form form={form} layout="vertical" onFinish={save} requiredMark="optional">
        <Form.Item name="name" label="Contact name" rules={[{ required: true, whitespace: true, message: 'Enter a name' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
          <Input />
        </Form.Item>
        <Typography.Text strong>Billing profile</Typography.Text>
        <Typography.Paragraph type="secondary" className="text-xs">
          Printed on every invoice. Changes apply to new invoices; existing ones keep the details they were issued with.
        </Typography.Paragraph>
        <Row gutter={12}>
          <Col xs={24} sm={14}>
            <Form.Item name="company" label="Company">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item name="phone" label="Phone" rules={[{ pattern: /^[0-9+\-\s]{7,15}$/, message: 'Enter a valid phone number' }]}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="billingAddress" label="Billing address">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item
          name="taxId"
          label="GSTIN"
          rules={[{ pattern: /^[0-9]{2}[A-Za-z0-9]{13}$/, message: '15 characters, starting with the 2-digit state code' }]}
        >
          <Input placeholder="e.g. 33ABCDE1234F1Z5" />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
