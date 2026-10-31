import { Alert, Button, Form, Input, Result } from 'antd'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authApi } from '../../api/auth'
import { parseError } from '../../api/errors'
import { PASSWORD_HINT, passwordRule } from '../../lib/password'
import { AuthCard } from './AuthCard'

/** Opened from the email link: /reset?token=... */
export default function ResetPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!token) {
    return (
      <AuthCard title="Invalid link">
        <Result status="warning" subTitle="This reset link is incomplete." extra={<Link to="/forgot">Request a new link</Link>} />
      </AuthCard>
    )
  }

  if (done) {
    return (
      <AuthCard title="Password updated">
        <Result status="success" subTitle="You can now log in with your new password." extra={<Link to="/login">Log in</Link>} />
      </AuthCard>
    )
  }

  const onFinish = async ({ password }: { password: string }) => {
    setBusy(true)
    setError(null)
    try {
      await authApi.reset(token, password)
      setDone(true)
    } catch (err) {
      const e = parseError(err)
      setError(e.fields?.token ? 'This link has expired or was already used.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCard title="Choose a new password">
      {error && (
        <Alert
          className="mb-4"
          type="error"
          showIcon
          title={error}
          action={<Link to="/forgot">New link</Link>}
        />
      )}
      <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Form.Item name="password" label="New password" extra={PASSWORD_HINT} rules={[passwordRule]} hasFeedback>
          <Input.Password autoComplete="new-password" autoFocus />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="Confirm new password"
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
        <Button type="primary" htmlType="submit" block loading={busy}>
          Update password
        </Button>
      </Form>
    </AuthCard>
  )
}
