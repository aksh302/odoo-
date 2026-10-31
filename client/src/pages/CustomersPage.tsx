import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Input, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CustomerDrawer } from '../components/CustomerDrawer'
import { usePagedList } from '../hooks/usePagedList'
import type { User } from '../lib/types'

/** SRS 9.7 /customers — searchable list; Admin and Staff create and edit customers (FR-1.11). */
export default function CustomersPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const list = usePagedList<User>('/customers', { q: search })

  const columns: ColumnsType<User> = [
    {
      title: 'Customer',
      render: (_, u) => (
        <span>
          <Typography.Link onClick={() => navigate(`/customers/${u.id}`)}>{u.profile?.company || u.name}</Typography.Link>
          {u.profile?.company && (
            <Typography.Text type="secondary" className="block text-xs">
              {u.name}
            </Typography.Text>
          )}
        </span>
      ),
    },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Phone', render: (_, u) => u.profile?.phone ?? '—' },
    { title: 'GSTIN', render: (_, u) => u.profile?.taxId ?? <Typography.Text type="secondary">—</Typography.Text> },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Typography.Title level={3}>Customers</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
          New customer
        </Button>
      </div>
      <Card>
        <Input
          className="mb-4 max-w-sm"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search name, email or company"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {list.error && <Alert className="mb-4" type="error" showIcon title={list.error} />}
        <Table<User>
          {...list.tableProps}
          columns={columns}
          scroll={{ x: 700 }}
          onRow={(u) => ({ onClick: () => navigate(`/customers/${u.id}`), style: { cursor: 'pointer' } })}
        />
      </Card>
      <CustomerDrawer
        target={adding ? 'new' : null}
        onClose={() => setAdding(false)}
        onSaved={(c) => {
          setAdding(false)
          navigate(`/customers/${c.id}`)
        }}
      />
    </>
  )
}
