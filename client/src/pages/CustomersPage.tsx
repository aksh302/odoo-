import { SearchOutlined } from '@ant-design/icons'
import { Alert, Card, Input, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useState } from 'react'
import { usePagedList } from '../hooks/usePagedList'
import type { User } from '../lib/types'

/**
 * WORKED EXAMPLE of a list page — copy this pattern for the other lists.
 * GET /customers?q=&page=&limit=  ->  { data, page, limit, total }
 * Still to add (SRS 9.7): create/edit drawer, /customers/:id detail.
 */
export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const list = usePagedList<User>('/customers', { q: search })

  const columns: ColumnsType<User> = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Email', dataIndex: 'email' },
    { title: 'Company', render: (_, u) => u.profile?.company ?? '—' },
    { title: 'Phone', render: (_, u) => u.profile?.phone ?? '—' },
    { title: 'Tax ID', render: (_, u) => u.profile?.taxId ?? '—' },
  ]

  return (
    <>
      <Typography.Title level={3}>Customers</Typography.Title>
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
        <Table<User> {...list.tableProps} columns={columns} scroll={{ x: 700 }} />
      </Card>
    </>
  )
}
