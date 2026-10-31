import { PlusOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Col,
  Divider,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { catalogApi } from '../api/catalog'
import type { ProductInput } from '../api/catalog'
import { applyFieldErrors, parseError } from '../api/errors'
import { useIsAdmin } from '../auth/AuthContext'
import { MoneyInput } from '../components/MoneyInput'
import { usePagedList } from '../hooks/usePagedList'
import { formatINR } from '../lib/money'
import type { Product, Tax, Variant } from '../lib/types'

const PRODUCT_TYPES = ['Service', 'Add-on', 'Software', 'Physical']

/** SRS 9.7 /products — Admin edits, Staff reads. FR-2.1 to FR-2.5. */
export default function ProductsPage() {
  const isAdmin = useIsAdmin()
  const { message } = App.useApp()
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const list = usePagedList<Product>('/products', { q: search, archived: showArchived || undefined })

  const [taxes, setTaxes] = useState<Tax[]>([])
  useEffect(() => {
    catalogApi.listTaxes().then(setTaxes).catch(() => setTaxes([]))
  }, [])

  // Drawer: null = closed, 'new' = create, Product = edit/view
  const [open, setOpen] = useState<Product | 'new' | null>(null)

  const toggleArchive = async (p: Product) => {
    try {
      await catalogApi.updateProduct(p.id, { isArchived: !p.isArchived })
      message.success(p.isArchived ? 'Product restored' : 'Product archived')
      list.reload()
    } catch (err) {
      message.error(parseError(err).message)
    }
  }

  const columns: ColumnsType<Product> = [
    {
      title: 'Product',
      render: (_, p) => (
        <Space orientation="vertical" size={0}>
          <Typography.Link onClick={() => setOpen(p)}>{p.name}</Typography.Link>
          {p.isArchived && <Tag>Archived</Tag>}
        </Space>
      ),
    },
    { title: 'Type', dataIndex: 'type' },
    { title: 'Sales price', align: 'right', render: (_, p) => formatINR(p.salesPrice) },
    { title: 'Cost price', align: 'right', render: (_, p) => formatINR(p.costPrice) },
    { title: 'Tax', render: (_, p) => p.tax?.name ?? '—' },
    {
      title: 'Variants',
      render: (_, p) => {
        const live = p.variants.filter((v) => !v.isArchived)
        if (!live.length) return <Typography.Text type="secondary">None</Typography.Text>
        return (
          <Space size={[4, 4]} wrap>
            {live.map((v) => (
              <Tag key={v.id}>
                {v.value} +{formatINR(v.extraPrice)}
              </Tag>
            ))}
          </Space>
        )
      },
    },
    {
      title: '',
      align: 'right',
      render: (_, p) =>
        isAdmin ? (
          <Space>
            <Button size="small" onClick={() => setOpen(p)}>
              Edit
            </Button>
            <Popconfirm
              title={p.isArchived ? 'Restore this product?' : 'Archive this product?'}
              description={p.isArchived ? undefined : 'It can no longer be added to new subscriptions. Existing ones are not affected.'}
              onConfirm={() => toggleArchive(p)}
                  okButtonProps={{ danger: !p.isArchived }}
                  okText={p.isArchived ? 'Restore' : 'Archive'}
            >
              <Button size="small" type="text">
                {p.isArchived ? 'Restore' : 'Archive'}
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          <Button size="small" onClick={() => setOpen(p)}>
            View
          </Button>
        ),
    },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Typography.Title level={3} style={{ margin: 0 }}>
          Products
        </Typography.Title>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen('new')}>
            New product
          </Button>
        )}
      </div>
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Input
            className="max-w-sm"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search name or type"
            aria-label="Search name or type"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Space>
            <Switch id="products-archived" size="small" checked={showArchived} onChange={setShowArchived} aria-label="Show archived" />
            <label htmlFor="products-archived" className="cursor-pointer select-none">Show archived</label>
          </Space>
        </div>
        {list.error && <Alert className="mb-4" type="error" showIcon title={list.error} />}
        <Table<Product> {...list.tableProps} columns={columns} scroll={{ x: 900 }} />
      </Card>

      <ProductDrawer
        target={open}
        taxes={taxes}
        readOnly={!isAdmin}
        onClose={() => setOpen(null)}
        onSaved={(p) => {
          list.reload()
          setOpen(p) // stay open so variants can be added right after creating
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------

function ProductDrawer({
  target,
  taxes,
  readOnly,
  onClose,
  onSaved,
}: {
  target: Product | 'new' | null
  taxes: Tax[]
  readOnly: boolean
  onClose: () => void
  onSaved: (p: Product) => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<ProductInput>()
  const [saving, setSaving] = useState(false)
  const product = target && target !== 'new' ? target : null

  useEffect(() => {
    if (!target) return
    form.resetFields()
    if (product) {
      form.setFieldsValue({
        name: product.name,
        type: product.type,
        salesPrice: product.salesPrice,
        costPrice: product.costPrice,
        taxId: product.taxId ?? null,
        sacCode: product.sacCode ?? '',
        notes: product.notes ?? '',
      })
    } else {
      form.setFieldsValue({ type: 'Service', salesPrice: 0, costPrice: 0 })
    }
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (values: ProductInput) => {
    setSaving(true)
    try {
      const input = { ...values, name: values.name.trim(), notes: values.notes?.trim() || null, sacCode: values.sacCode?.trim() || null }
      const saved = product
        ? await catalogApi.updateProduct(product.id, input)
        : await catalogApi.createProduct(input)
      message.success(product ? 'Product saved' : 'Product created — now add variants if it has any')
      onSaved(saved)
    } catch (err) {
      const e = applyFieldErrors(form, err)
      if (!e.fields) message.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const title = readOnly ? product?.name : product ? `Edit ${product.name}` : 'New product'

  return (
    <Drawer
      open={!!target}
      onClose={onClose}
      title={title}
      size={640}
      destroyOnHidden
      extra={
        !readOnly && (
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {product ? 'Save' : 'Create'}
          </Button>
        )
      }
    >
      <Form form={form} layout="vertical" onFinish={save} disabled={readOnly} requiredMark="optional">
        <Row gutter={12}>
          <Col xs={24} sm={14}>
            <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Enter a name' }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item name="type" label="Type" rules={[{ required: true, message: 'Choose a type' }]}>
              <AutoComplete options={PRODUCT_TYPES.map((t) => ({ value: t }))} />
            </Form.Item>
          </Col>
          <Col xs={12}>
            <Form.Item name="salesPrice" label="Sales price" rules={[{ required: true, message: 'Enter a price' }]}>
              <MoneyInput />
            </Form.Item>
          </Col>
          <Col xs={12}>
            <Form.Item
              name="costPrice"
              label="Cost price"
              tooltip="Internal only — never shown to customers"
              rules={[{ required: true, message: 'Enter a cost' }]}
            >
              <MoneyInput />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="sacCode" label="SAC code" tooltip="GST service code printed on invoices, e.g. 997331 for software licences" rules={[{ pattern: /^\d{4,8}$/, message: '4 to 8 digits' }]}>
              <Input placeholder="997331" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item name="taxId" label="Tax">
              <Select
                allowClear
                placeholder="No tax"
            aria-label="No tax"
                options={taxes.map((t) => ({ value: t.id, label: `${t.name} (${t.percent}%)` }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="notes" label="Notes">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      {product && <VariantEditor product={product} readOnly={readOnly} onChanged={onSaved} />}
      {!product && !readOnly && (
        <Typography.Text type="secondary">Save the product first, then you can add variants.</Typography.Text>
      )}
    </Drawer>
  )
}

// ---------------------------------------------------------------------------

/** FR-2.2/2.3: variants by attribute + value, each adding an extra price. */
function VariantEditor({
  product,
  readOnly,
  onChanged,
}: {
  product: Product
  readOnly: boolean
  onChanged: (p: Product) => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<{ attribute: string; value: string; extraPrice: number }>()
  const [adding, setAdding] = useState(false)
  const [variants, setVariants] = useState<Variant[]>(product.variants)
  useEffect(() => setVariants(product.variants), [product])

  const push = (next: Variant[]) => {
    setVariants(next)
    onChanged({ ...product, variants: next })
  }

  const add = async (v: { attribute: string; value: string; extraPrice: number }) => {
    setAdding(true)
    try {
      const created = await catalogApi.createVariant({
        productId: product.id,
        attribute: v.attribute.trim(),
        value: v.value.trim(),
        extraPrice: v.extraPrice ?? 0,
      })
      push([...variants, created])
      form.resetFields(['value', 'extraPrice'])
      message.success('Variant added')
    } catch (err) {
      const e = applyFieldErrors(form, err)
      if (!e.fields) message.error(e.message)
    } finally {
      setAdding(false)
    }
  }

  const toggle = async (v: Variant) => {
    try {
      const updated = await catalogApi.updateVariant(v.id, { isArchived: !v.isArchived })
      push(variants.map((x) => (x.id === v.id ? updated : x)))
    } catch (err) {
      message.error(parseError(err).message)
    }
  }

  const attributes = Array.from(new Set(['Brand', ...variants.map((v) => v.attribute)]))

  const columns: ColumnsType<Variant> = [
    { title: 'Attribute', dataIndex: 'attribute' },
    { title: 'Value', dataIndex: 'value' },
    { title: 'Extra', align: 'right', render: (_, v) => `+${formatINR(v.extraPrice)}` },
    {
      title: 'Final price',
      align: 'right',
      render: (_, v) => <strong>{formatINR(product.salesPrice + v.extraPrice)}</strong>,
    },
    {
      title: 'Active',
      align: 'center',
      render: (_, v) => (
        <Switch size="small" checked={!v.isArchived} disabled={readOnly} onChange={() => toggle(v)} aria-label={`${v.value} variant active`} />
      ),
    },
  ]

  return (
    <>
      <Divider titlePlacement="start">Variants</Divider>
      <Table<Variant>
        size="small"
        rowKey="id"
        dataSource={variants}
        columns={columns}
        pagination={false}
        locale={{ emptyText: 'No variants — this product is sold at its base price.' }}
        rowClassName={(v) => (v.isArchived ? 'opacity-50' : '')}
      />
      {!readOnly && (
        <Form
          form={form}
          layout="vertical"
          onFinish={add}
          className="mt-4"
          initialValues={{ attribute: 'Brand', extraPrice: 0 }}
        >
          <Row gutter={8} align="bottom">
            <Col xs={24} sm={7}>
              <Form.Item name="attribute" label="Attribute" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
                <AutoComplete options={attributes.map((a) => ({ value: a }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={7}>
              <Form.Item name="value" label="Value" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
                <Input placeholder="e.g. Odoo" />
              </Form.Item>
            </Col>
            <Col xs={16} sm={6}>
              <Form.Item name="extraPrice" label="Extra price">
                <MoneyInput />
              </Form.Item>
            </Col>
            <Col xs={8} sm={4}>
              <Form.Item>
                <Button htmlType="submit" icon={<PlusOutlined />} loading={adding} block>
                  Add
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      )}
    </>
  )
}
