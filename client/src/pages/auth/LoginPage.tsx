import { Alert, Button, Form, Input } from 'antd'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { USE_MOCKS } from '../../api/client'
import { parseError } from '../../api/errors'
import { homeFor, useAuth } from '../../auth/AuthContext'
import { AuthCard } from './AuthCard'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onFinish = async (v: { email: string; password: string }) => {
    setBusy(true)
    setError(null)
    try {
      const user = await login(v.email.trim(), v.password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? homeFor(user.role), { replace: true })
    } catch (err) {
      const e = parseError(err)
      setError(e.code === 'UNAUTHENTICATED' ? 'Wrong email or password.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Log in to Brightloop">
      {USE_MOCKS && (
        <div
          className="mb-5 rounded-md px-4 py-3 text-sm"
          style={{ background: '#FFFFFF', border: '1px dashed #C9D6D0', color: '#4A5A53', lineHeight: 1.6 }}
        >
          Demo accounts: admin@brightloop.test, staff@brightloop.test or customer@brightloop.test. Password for all:
          Demo@12345
        </div>
      )}
      {error && <Alert className="mb-4" type="error" showIcon title={error} />}
      <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
          <Input autoComplete="email" autoFocus />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <div className="mb-4 text-right">
          <Link to="/forgot">Forgot password?</Link>
        </div>
        <Button type="primary" htmlType="submit" block loading={busy}>
          Log in
        </Button>
      </Form>
      <div className="mt-4 text-center">
        New here? <Link to="/signup">Create an account</Link>
      </div>
    </AuthCard>
  )
}
