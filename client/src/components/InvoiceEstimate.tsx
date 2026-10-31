import { Typography } from 'antd'
import { unitPriceOf } from '../hooks/useCatalog'
import { estimateInvoice } from '../lib/estimate'
import { formatINR } from '../lib/money'
import type { Plan, Product } from '../lib/types'
import { PERIOD_WORD } from '../lib/labels'
import type { LineValue } from './LinesEditor'

/** "What each invoice will look like" for the plan + lines being edited. */
export function InvoiceEstimate({ plan, lines, products }: { plan?: Plan; lines: LineValue[]; products: Product[] }) {
  const est = estimateInvoice(
    plan?.price ?? 0,
    lines
      .filter((l) => l?.productId)
      .map((l) => {
        const p = products.find((x) => x.id === l.productId)
        return {
          quantity: l.quantity ?? 0,
          unitPrice: unitPriceOf(products, l.productId, l.variantId),
          taxPercent: p?.tax?.percent,
        }
      }),
  )

  const row = (label: string, value: number, strong = false) => (
    <div className="flex justify-between py-1" style={strong ? { fontWeight: 600, fontSize: 18 } : undefined}>
      <span>{label}</span>
      <span>{formatINR(value)}</span>
    </div>
  )

  return (
    <div>
      {row(plan ? `Plan fee (${plan.name})` : 'Plan fee', est.planFee)}
      {row('Products', est.productsSubtotal)}
      {row('Tax', est.tax)}
      <div className="my-2 border-0 border-t border-solid" style={{ borderColor: '#DCE4E0' }} />
      {row(plan ? `Each ${PERIOD_WORD[plan.billingPeriod]}` : 'Each invoice', est.total, true)}
      <Typography.Paragraph type="secondary" className="mt-2 mb-0 text-xs">
        Before discounts. Any discount that applies is added automatically when the invoice is created.
      </Typography.Paragraph>
    </div>
  )
}
