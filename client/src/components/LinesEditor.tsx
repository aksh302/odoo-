import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Empty, Form, InputNumber, Select, Typography } from 'antd'
import { unitPriceOf } from '../hooks/useCatalog'
import { formatINR } from '../lib/money'
import type { Product } from '../lib/types'

export interface LineValue {
  productId?: number
  variantId?: number | null
  quantity?: number
}

/**
 * Product lines inside a parent <Form> (field name "lines").
 * Used by quotation templates and subscriptions.
 * Quantity is checked against the plan's minimum quantity (FR-4.7).
 */
export function LinesEditor({ products, minQty = 1 }: { products: Product[]; minQty?: number }) {
  const form = Form.useFormInstance()
  const lines: LineValue[] = Form.useWatch('lines', form) ?? []
  const live = products.filter((p) => !p.isArchived)

  return (
    <Form.List
      name="lines"
      rules={[
        {
          validator: async (_, value?: LineValue[]) => {
            if (!value || value.length === 0) throw new Error('Add at least one product')
          },
        },
      ]}
    >
      {(fields, { add, remove }, { errors }) => (
        <div>
          {fields.length > 0 && (
            <div className="hidden gap-3 px-1 pb-2 text-xs sm:grid" style={{ gridTemplateColumns: '2.2fr 1.5fr 0.9fr 1fr 32px', color: '#5B6B64' }}>
              <span>Product</span>
              <span>Variant</span>
              <span>Quantity</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
          )}

          {fields.map((field) => {
            const line = lines[field.name] ?? {}
            const product = products.find((p) => p.id === line.productId)
            const variants = product?.variants.filter((v) => !v.isArchived || v.id === line.variantId) ?? []
            const unit = unitPriceOf(products, line.productId, line.variantId)
            const amount = unit * (line.quantity ?? 0)
            return (
              <div
                key={field.key}
                className="mb-3 grid items-start gap-3 rounded-md border border-solid p-3 sm:mb-1 sm:border-0 sm:p-1"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(0, 1fr))', borderColor: '#DCE4E0' }}
              >
                <div className="grid gap-3 sm:items-start" style={{ gridColumn: '1 / -1', gridTemplateColumns: 'var(--line-cols)' }}>
                  <Form.Item name={[field.name, 'productId']} rules={[{ required: true, message: 'Choose a product' }]} style={{ margin: 0 }}>
                    <Select
                      showSearch={{ optionFilterProp: 'label' }}
                      placeholder="Choose a product"
                      options={live.map((p) => ({ value: p.id, label: p.name }))}
                      onChange={() => form.setFieldValue(['lines', field.name, 'variantId'], null)}
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, 'variantId']} style={{ margin: 0 }}>
                    <Select
                      allowClear
                      disabled={!variants.length}
                      placeholder={product ? (variants.length ? 'Base version' : 'No variants') : '—'}
                      options={variants.map((v) => ({ value: v.id, label: `${v.value} (+${formatINR(v.extraPrice)})` }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name={[field.name, 'quantity']}
                    rules={[
                      { required: true, message: 'Required' },
                      { type: 'number', min: minQty, message: `At least ${minQty}` },
                    ]}
                    style={{ margin: 0 }}
                  >
                    <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                  </Form.Item>
                  <div className="pt-1 text-right">
                    <div className="font-medium">{formatINR(amount)}</div>
                    {line.productId && (
                      <Typography.Text type="secondary" className="text-xs">
                        {formatINR(unit)} each
                      </Typography.Text>
                    )}
                  </div>
                  <Button
                    type="text"
                    icon={<DeleteOutlined />}
                    aria-label="Remove line"
                    onClick={() => remove(field.name)}
                  />
                </div>
              </div>
            )
          })}

          {fields.length === 0 && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No products yet. The plan fee is billed on its own." />
          )}
          <Button className="mt-2" icon={<PlusOutlined />} onClick={() => add({ quantity: minQty, variantId: null })}>
            Add product
          </Button>
          <Form.ErrorList errors={errors} />
        </div>
      )}
    </Form.List>
  )
}
