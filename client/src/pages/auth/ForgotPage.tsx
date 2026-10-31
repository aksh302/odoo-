import { Alert, Button, Form, Input, Result } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { parseError } from '../../api/errors'
import { AuthCard } from './AuthCard'

export default function ForgotPage() {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFinish = async ({ email }: { email: string }) => {
    setBusy(true)
    setError(null)
    try {
      await authApi.forgot(email.trim().toLowerCase())
      setSent(true)
    } catch (err) {
      setError(parseError(err).message) // e.g. RATE_LIMITED
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    // FR-1.8: same message whether or not the email exists.
    return (
      <AuthCard title="Check your email">
        <Result
          status="success"
          subTitle="If an account exists for that email, we've sent a reset link. It's valid for 1 hour."
          extra={<Link to="/login">Back to log in</Link>}
        />
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Reset your password" subtitle="Enter your account email and we'll send you a reset link.">
      {error && <Alert className="mb-4" type="error" showIcon title={error} />}
      <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
          <Input autoComplete="email" autoFocus />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={busy}>
          Send reset link
        </Button>
      </Form>
      <div className="mt-4 text-center">
        <Link to="/login">Back to log in</Link>
      </div>
    </AuthCard>
  )
}
