import { PlusOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Form, Input, InputNumber, Modal, Table, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { adminApi } from '../../api/admin'
import { applyFieldErrors } from '../../api/errors'
import { usePagedList } from '../../hooks/usePagedList'
import type { Tax } from '../../lib/types'

/** SRS 9.7 /taxes — Admin only (FR-5.1). Rates are snapshotted on invoice lines, so edits only affect new invoices. */
export default function TaxesPage() {
  const list = usePagedList<Tax>('/taxes', {}, 50)
  const [editing, setEditing] = useState<Tax | 'new' | null>(null)

  const columns: ColumnsType<Tax> = [
    { title: 'Name', render: (_, t) => <Typography.Link onClick={() => setEditing(t)}>{t.name}</Typography.Link> },
    { title: 'Rate', align: 'right', render: (_, t) => `${t.percent}%` },
    {
      title: '',
      align: 'right',
      render: (_, t) => (
        <Button size="small" onClick={() => setEditing(t)}>
          Edit
        </Button>
      ),
    },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Typography.Title level={3}>Taxes</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
          New tax
        </Button>
      </div>
      <Card>
        <Typography.Paragraph type="secondary">
          Attach a tax to a product on the Products page. Each invoice keeps the rate it was created with, so changing a rate only affects new invoices.
        </Typography.Paragraph>
        {list.error && <Alert className="mb-4" type="error" showIcon title={list.error} />}
        <Table<Tax> {...list.tableProps} columns={columns} pagination={false} />
      </Card>
      <TaxModal
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          list.reload()
        }}
      />
    </>
  )
}

function TaxModal({ target, onClose, onSaved }: { target: Tax | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<{ name: string; percent: number }>()
  const [saving, setSaving] = useState(false)
  const tax = target && target !== 'new' ? target : null

  useEffect(() => {
    if (!target) return
    form.resetFields()
    form.setFieldsValue(tax ? { name: tax.name, percent: tax.percent } : { percent: 18 })
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (v: { name: string; percent: number }) => {
    setSaving(true)
    try {
      const input = { name: v.name.trim(), percent: v.percent }
      if (tax) await adminApi.updateTax(tax.id, input)
      else await adminApi.createTax(input)
      message.success(tax ? 'Tax saved' : 'Tax created')
      onSaved()
    } catch (err) {
      const e = applyFieldErrors(form, err)
      if (!e.fields) message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={!!target}
      title={tax ? `Edit ${tax.name}` : 'New tax'}
      okText={tax ? 'Save' : 'Create'}
      onOk={() => form.submit()}
      confirmLoading={saving}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
        <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter a name' }]}>
          <Input placeholder="e.g. GST 18%" />
        </Form.Item>
        <Form.Item name="percent" label="Rate" rules={[{ required: true, type: 'number', min: 0, max: 100, message: 'Between 0 and 100' }]}>
          <InputNumber min={0} max={100} precision={2} suffix="%" style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
