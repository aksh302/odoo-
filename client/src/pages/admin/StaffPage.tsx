import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Form, Input, Modal, Popconfirm, Switch, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useState } from 'react'
import { adminApi } from '../../api/admin'
import { applyFieldErrors, parseError } from '../../api/errors'
import { useAuth } from '../../auth/AuthContext'
import { usePagedList } from '../../hooks/usePagedList'
import { PASSWORD_HINT, passwordRule } from '../../lib/password'
import type { User } from '../../lib/types'

/** SRS 9.7 /staff — only the Admin adds staff (FR-1.6); users are deactivated, never deleted (FR-1.12). */
export default function StaffPage() {
  const { user: me } = useAuth()
  const { message } = App.useApp()
  const [search, setSearch] = useState('')
  const list = usePagedList<User>('/users', { q: search })
  const [adding, setAdding] = useState(false)

  const toggle = async (u: User) => {
    try {
      await adminApi.setActive(u.id, !u.isActive)
      message.success(u.isActive ? `${u.name} can no longer log in` : `${u.name} can log in again`)
      list.reload()
    } catch (err) {
      message.error(parseError(err).message)
    }
  }

  const columns: ColumnsType<User> = [
    {
      title: 'Name',
      render: (_, u) => (
        <span>
          {u.name}
          {u.id === me?.id && <Typography.Text type="secondary"> (you)</Typography.Text>}
        </span>
      ),
    },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Role', render: (_, u) => <Tag color={u.role === 'ADMIN' ? 'green' : 'default'}>{u.role === 'ADMIN' ? 'Admin' : 'Staff'}</Tag> },
    {
      title: 'Can log in',
      align: 'center',
      render: (_, u) =>
        u.id === me?.id ? (
          <Switch size="small" checked disabled />
        ) : (
          <Popconfirm
            title={u.isActive ? `Deactivate ${u.name}?` : `Reactivate ${u.name}?`}
            description={u.isActive ? 'They are logged out and can’t log in. Their history stays.' : undefined}
            okText={u.isActive ? 'Deactivate' : 'Reactivate'}
            okButtonProps={{ danger: u.isActive }}
            onConfirm={() => toggle(u)}
          >
            <Switch size="small" checked={u.isActive} />
          </Popconfirm>
        ),
    },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Typography.Title level={3}>Staff</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
          Add staff member
        </Button>
      </div>
      <Card>
        <Input
          className="mb-4 max-w-xs"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {list.error && <Alert className="mb-4" type="error" showIcon title={list.error} />}
        <Table<User> {...list.tableProps} columns={columns} scroll={{ x: 640 }} rowClassName={(u) => (u.isActive ? '' : 'opacity-60')} />
      </Card>
      <AddStaffModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false)
          list.reload()
        }}
      />
    </>
  )
}

function AddStaffModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<{ name: string; email: string; password: string }>()
  const [saving, setSaving] = useState(false)

  const save = async (v: { name: string; email: string; password: string }) => {
    setSaving(true)
    try {
      const u = await adminApi.createStaff({ name: v.name.trim(), email: v.email.trim().toLowerCase(), password: v.password })
      message.success(`${u.name} added. Share the password with them securely.`)
      form.resetFields()
      onAdded()
    } catch (err) {
      const e = applyFieldErrors(form, err)
      if (!e.fields) message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} title="Add staff member" okText="Add staff member" onOk={() => form.submit()} confirmLoading={saving} onCancel={onClose} destroyOnHidden>
      <Typography.Paragraph type="secondary">
        Staff can manage customers, subscriptions, invoices and payments. They can’t change the catalog, taxes, discounts or staff.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter a name' }]}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item name="email" label="Work email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item name="password" label="Temporary password" extra={PASSWORD_HINT} rules={[passwordRule]} hasFeedback>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
