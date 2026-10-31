import { Typography } from 'antd'
import type { ReactNode } from 'react'
import { Logo } from '../../brand/Logo'
import { brand } from '../../brand/theme'
import { MonthRing } from './MonthRing'

/**
 * Split screen for login, signup, forgot and reset.
 * Left: the month's billing cycle (hidden on small screens). Right: the form.
 */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <aside
        className="hidden flex-col justify-between p-10 lg:flex"
        style={{ background: brand.pine, width: '46%', minHeight: '100vh' }}
      >
        <Logo onDark />
        <div className="flex flex-col items-center">
          <MonthRing />
          <p
            style={{
              fontFamily: brand.fontDisplay,
              color: '#FFFFFF',
              fontSize: 30,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              fontWeight: 600,
              maxWidth: 420,
              textAlign: 'center',
              margin: '28px 0 10px',
            }}
          >
            Every renewal billed on its day, every payment matched to its invoice.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.68)', maxWidth: 400, textAlign: 'center', margin: 0, lineHeight: 1.55 }}>
            Plans, subscriptions, invoices and payments for recurring businesses, in one place.
          </p>
        </div>
        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
          Mint dots are renewals already billed. Marigold dots are still due.
        </span>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full" style={{ maxWidth: 400 }}>
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1
            style={{
              fontFamily: brand.fontDisplay,
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '0 0 6px',
              color: brand.slate,
            }}
          >
            {title}
          </h1>
          {subtitle && <Typography.Paragraph type="secondary">{subtitle}</Typography.Paragraph>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  )
}
