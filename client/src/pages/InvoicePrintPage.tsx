import { Button, Result, Spin } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { billingApi, methodLabel } from '../api/billing'
import type { InvoiceDetail } from '../api/billing'
import { parseError } from '../api/errors'
import { portalApi } from '../api/portal'
import { Logo } from '../brand/Logo'
import { brand } from '../brand/theme'
import { company } from '../lib/company'
import { DEFAULT_SAC, gstSplit } from '../lib/gst'
import { formatINR } from '../lib/money'
import { UpiQr } from '../components/UpiQr'

const fmt = (d?: string | null) => (d ? dayjs(d).format('D MMM YYYY') : '—')

/**
 * Printable invoice (A4). Opens in its own tab from "Print",
 * and stands in for the server PDF in mock mode.
 */
export default function InvoicePrintPage({ source = 'staff' }: { source?: 'staff' | 'portal' }) {
  const { id } = useParams()
  const [data, setData] = useState<InvoiceDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = source === 'portal' ? portalApi.getInvoice : billingApi.getInvoice
    load(Number(id))
      .then((d) => {
        setData(d)
        document.title = d.invoice.number
      })
      .catch((err) => setError(parseError(err).message))
  }, [id, source])

  if (error) return <Result status="404" title="Invoice not found" subTitle={error} />
  if (!data) return <div className="flex h-full items-center justify-center"><Spin /></div>

  const { invoice: inv, lines, payments } = data
  const c = inv.customerSnapshot
  const balance = inv.total - inv.amountPaid
  const gst = gstSplit(inv.taxTotal, c.taxId)
  const cell = { padding: '8px 6px', borderBottom: `1px solid ${brand.line}` } as const

  return (
    <div className="print-page" style={{ background: '#E9EEEB', minHeight: '100%', padding: '32px 16px' }}>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .print-page { background: #fff !important; padding: 0 !important; }
          .print-sheet { box-shadow: none !important; padding: 0 !important; max-width: none !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex justify-end gap-2" style={{ maxWidth: 800 }}>
        <Button onClick={() => window.close()}>Close</Button>
        <Button type="primary" onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>

      <div className="print-sheet mx-auto" style={{ maxWidth: 800, background: '#fff', padding: 48, boxShadow: '0 1px 3px rgba(22,53,44,0.12)', color: brand.slate }}>
        <div className="flex items-start justify-between">
          <div>
            <Logo />
            <div style={{ fontSize: 12, color: '#5B6B64', marginTop: 10, lineHeight: 1.6 }}>
              {company.name}
              <br />
              {company.address}
              <br />
              GSTIN {company.gstin}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: brand.fontDisplay, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>Tax invoice</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>{inv.number}</div>
            {inv.status === 'PAID' && <div style={{ marginTop: 6, color: brand.green, fontWeight: 600 }}>Paid</div>}
            {inv.status === 'CANCELLED' && <div style={{ marginTop: 6, color: '#B42318', fontWeight: 600 }}>Cancelled</div>}
          </div>
        </div>

        <div className="mt-10 grid gap-6" style={{ gridTemplateColumns: '1.3fr 1fr', fontSize: 13 }}>
          <div>
            <div style={{ color: '#5B6B64', marginBottom: 4 }}>Bill to</div>
            <div style={{ fontWeight: 600 }}>{c.company || c.name}</div>
            {c.company && <div>{c.name}</div>}
            {c.billingAddress && <div>{c.billingAddress}</div>}
            {c.email && <div>{c.email}</div>}
            {c.taxId && <div>GSTIN {c.taxId}</div>}
          </div>
          <table style={{ fontSize: 13, borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['Issued', fmt(inv.createdAt)],
                ['Billing period', `${fmt(inv.periodStart)} – ${fmt(inv.periodEnd)}`],
                ['Due', fmt(inv.dueDate)],
                ['Subscription', inv.subscriptionNumber ?? ''],
                ['Place of supply', gst.placeOfSupply],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ color: '#5B6B64', padding: '2px 12px 2px 0' }}>{k}</td>
                  <td style={{ padding: '2px 0', textAlign: 'right' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <table className="mt-8 w-full" style={{ borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          <thead>
            <tr style={{ background: '#F2F5F3', textAlign: 'left' }}>
              <th style={cell}>Item</th>
              <th style={{ ...cell, textAlign: 'right' }}>Qty</th>
              <th style={{ ...cell, textAlign: 'right' }}>Unit price</th>
              <th style={{ ...cell, textAlign: 'right' }}>Discount</th>
              <th style={{ ...cell, textAlign: 'right' }}>GST</th>
              <th style={{ ...cell, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td style={cell}>
                  {l.description}
                  <div style={{ fontSize: 11, color: '#5B6B64' }}>
                    SAC {l.sacCode || DEFAULT_SAC}
                    {l.discountName ? `, ${l.discountName}` : ''}
                  </div>
                </td>
                <td style={{ ...cell, textAlign: 'right' }}>{l.quantity}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{formatINR(l.unitPrice)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{l.discountAmount ? `−${formatINR(l.discountAmount)}` : '—'}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{l.taxAmount ? `${formatINR(l.taxAmount)} (${l.taxPercent}%)` : '—'}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{formatINR(l.amount - l.discountAmount + l.taxAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-6" style={{ maxWidth: 300, fontSize: 13 }}>
          {[
            ['Subtotal', formatINR(inv.subtotal)],
            ...(inv.discountTotal ? [['Discount', `−${formatINR(inv.discountTotal)}`]] : []),
            ...(gst.kind === 'INTRA'
              ? [
                  ['CGST', formatINR(gst.cgst)],
                  ['SGST', formatINR(gst.sgst)],
                ]
              : [['IGST', formatINR(gst.igst)]]),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-1">
              <span>{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <div className="flex justify-between py-2" style={{ borderTop: `1px solid ${brand.slate}`, marginTop: 6, fontWeight: 700, fontSize: 16 }}>
            <span>Total</span>
            <span>{formatINR(inv.total)}</span>
          </div>
          {inv.amountPaid > 0 && (
            <div className="flex justify-between py-1">
              <span>Paid</span>
              <span>−{formatINR(inv.amountPaid)}</span>
            </div>
          )}
          {inv.status !== 'CANCELLED' && (
            <div className="flex justify-between py-1" style={{ fontWeight: 600 }}>
              <span>Balance due</span>
              <span>{formatINR(balance)}</span>
            </div>
          )}
        </div>

        {payments.filter((p) => !p.voidedAt).length > 0 && (
          <div className="mt-8" style={{ fontSize: 12 }}>
            <div style={{ color: '#5B6B64', marginBottom: 4 }}>Payments received</div>
            {payments
              .filter((p) => !p.voidedAt)
              .map((p) => (
                <div key={p.id}>
                  {fmt(p.date)}, {methodLabel(p.method)}
                  {p.reference ? ` (${p.reference})` : ''}: {formatINR(p.amount)}
                </div>
              ))}
          </div>
        )}

        <div className="mt-12 flex items-end justify-between gap-6" style={{ fontSize: 11, color: '#5B6B64', borderTop: `1px solid ${brand.line}`, paddingTop: 12 }}>
          <div style={{ maxWidth: 420, lineHeight: 1.6 }}>
            Please pay by {fmt(inv.dueDate)} and quote {inv.number} with your payment. Amounts in Indian rupees.
            {inv.status === 'CONFIRMED' && balance > 0 && (
              <>
                <br />
                Scan the QR with any UPI app to pay {formatINR(balance)} to {company.upiId}.
              </>
            )}
          </div>
          {inv.status === 'CONFIRMED' && balance > 0 && <UpiQr amount={balance} invoiceNumber={inv.number} size={104} compact />}
        </div>
      </div>
    </div>
  )
}
