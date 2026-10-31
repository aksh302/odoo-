import { Button, Skeleton, Typography } from 'antd'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { company } from '../lib/company'
import { formatINR } from '../lib/money'

/**
 * UPI payment link for an amount and invoice, following the NPCI deep-link format.
 * Any UPI app (scanned or tapped on a phone) opens with the payee, amount and note filled in.
 */
export function upiLink(amountPaise: number, invoiceNumber: string) {
  const params = new URLSearchParams({
    pa: company.upiId,
    pn: company.name,
    am: (amountPaise / 100).toFixed(2),
    cu: 'INR',
    // The note shows in the payer's app and often in the bank SMS, which helps automatic matching.
    // (No `tr` merchant reference: many UPI apps warn on it for non-merchant UPI IDs.)
    tn: invoiceNumber,
  })
  return `upi://pay?${params.toString()}`
}

/** A scannable UPI QR for one invoice's balance. */
export function UpiQr({
  amount,
  invoiceNumber,
  size = 168,
  compact = false,
}: {
  amount: number
  invoiceNumber: string
  size?: number
  compact?: boolean
}) {
  const [svg, setSvg] = useState<string | null>(null)
  const link = upiLink(amount, invoiceNumber)

  useEffect(() => {
    QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#16352C', light: '#FFFFFF' } })
      .then(setSvg)
      .catch(() => setSvg(null))
  }, [link])

  const qr = svg ? (
    <div
      role="img"
      aria-label={`UPI QR code to pay ${formatINR(amount)} for ${invoiceNumber}`}
      style={{ width: size, height: size, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  ) : (
    <Skeleton.Node active style={{ width: size, height: size }} />
  )

  if (compact) return qr

  return (
    <div className="flex flex-wrap items-center gap-5">
      {qr}
      <div style={{ maxWidth: 260 }}>
        <div className="font-semibold">Pay {formatINR(amount)} by UPI</div>
        <Typography.Text type="secondary" className="block text-sm">
          Scan with any UPI app. The amount and invoice number are filled in, so the payment is easy to match.
        </Typography.Text>
        <Typography.Text type="secondary" className="mt-1 block text-xs">
          To {company.upiId}
        </Typography.Text>
        {/* On phones, open the UPI app directly */}
        <Button className="mt-3 sm:hidden" type="primary" href={link}>
          Open UPI app
        </Button>
      </div>
    </div>
  )
}
