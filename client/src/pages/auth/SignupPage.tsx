import { Alert, Button, Col, Divider, Form, Input, Row } from 'antd'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { SignupInput } from '../../api/auth'
import { applyFieldErrors } from '../../api/errors'
import { homeFor, useAuth } from '../../auth/AuthContext'
import { PASSWORD_HINT, passwordRule } from '../../lib/password'
import { AuthCard } from './AuthCard'

export default function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onFinish = async (v: SignupInput & { confirm: string }) => {
    setBusy(true)
    setError(null)
    try {
      const { confirm: _confirm, ...input } = v
      const user = await signup({ ...input, email: input.email.trim().toLowerCase() })
      navigate(homeFor(user.role), { replace: true })
    } catch (err) {
      const e = applyFieldErrors(form, err)
      if (!e.fields) setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Create your account" subtitle="See your subscriptions, download invoices and renew without emailing anyone.">
      {error && <Alert className="mb-4" type="error" showIcon title={error} />}
      <Form form={form} layout="vertical" onFinish={onFinish} requiredMark="optional">
        <Form.Item name="name" label="Your name" rules={[{ required: true, message: 'Enter your name' }]}>
          <Input autoComplete="name" />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
          <Input autoComplete="email" />
        </Form.Item>
        <Form.Item name="password" label="Password" extra={PASSWORD_HINT} rules={[passwordRule]} hasFeedback>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="Confirm password"
          dependencies={['password']}
          hasFeedback
          rules={[
            { required: true, message: 'Confirm your password' },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                !value || getFieldValue('password') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error('Passwords do not match')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>

        <Divider plain>Business details (optional)</Divider>
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="company" label="Company">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="phone"
              label="Phone"
              rules={[{ pattern: /^[0-9+\-\s]{7,15}$/, message: 'Enter a valid phone number' }]}
            >
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="billingAddress" label="Billing address">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="taxId" label="Tax ID (GSTIN)">
          <Input />
        </Form.Item>

        <Button type="primary" htmlType="submit" block loading={busy}>
          Create account
        </Button>
      </Form>
      <div className="mt-4 text-center">
        Already have an account? <Link to="/login">Log in</Link>
      </div>
    </AuthCard>
  )
}
