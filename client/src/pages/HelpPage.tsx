import { SearchOutlined } from '@ant-design/icons'
import { Anchor, Button, Card, Col, Empty, Input, Row, Table, Tag, Typography } from 'antd'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { brand } from '../brand/theme'
import type { Role } from '../lib/types'

/**
 * The in-app rule book: how to do each job, and the rules the system enforces.
 * Each person sees only the sections for their role.
 */

interface Topic {
  id: string
  title: string
  roles: Role[]
  /** one-line answer shown under the title */
  summary: string
  steps?: string[]
  rules?: string[]
  link?: { to: string; label: string }
  extra?: ReactNode
}

interface Section {
  id: string
  title: string
  topics: Topic[]
}

const BACK: Role[] = ['ADMIN', 'STAFF']
const ADMIN: Role[] = ['ADMIN']
const ALL: Role[] = ['ADMIN', 'STAFF', 'CUSTOMER']
const CUST: Role[] = ['CUSTOMER']

const ROLE_TABLE = (
  <Table
    size="small"
    pagination={false}
    rowKey="what"
    className="mt-3"
    scroll={{ x: 520 }}
    columns={[
      { title: 'What', dataIndex: 'what' },
      { title: 'Admin', dataIndex: 'admin' },
      { title: 'Staff', dataIndex: 'staff' },
      { title: 'Customer', dataIndex: 'customer' },
    ]}
    dataSource={[
      { what: 'Products, plans, taxes, discounts', admin: 'Create and edit', staff: 'View only', customer: 'Browse plans' },
      { what: 'Customers', admin: 'Create and edit', staff: 'Create and edit', customer: 'Own profile' },
      { what: 'Quotation templates', admin: 'Yes', staff: 'Yes', customer: 'No' },
      { what: 'Subscriptions', admin: 'All actions', staff: 'All actions', customer: 'Own: pause, resume, renew, close, request' },
      { what: 'Invoices and billing runs', admin: 'Yes', staff: 'Yes', customer: 'Own invoices, PDF' },
      { what: 'Record payments', admin: 'Yes', staff: 'Yes', customer: 'See own history' },
      { what: 'Void a payment', admin: 'Yes', staff: 'No', customer: 'No' },
      { what: 'Add or deactivate staff', admin: 'Yes', staff: 'No', customer: 'No' },
      { what: 'Dashboard and audit log', admin: 'Yes', staff: 'Yes (audit read only)', customer: 'No' },
    ]}
  />
)

const LIFECYCLE = (
  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
    {['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'].map((s, i, a) => (
      <span key={s} className="inline-flex items-center gap-2">
        <Tag color={s === 'Active' ? 'green' : undefined}>{s}</Tag>
        {i < a.length - 1 && <span style={{ color: '#5B6B64' }}>→</span>}
      </span>
    ))}
    <span className="block w-full" style={{ color: '#5B6B64' }}>
      Active ⇄ Paused. Draft, Quotation or Confirmed can be Cancelled. Closed and Cancelled are final.
    </span>
  </div>
)

const SECTIONS: Section[] = [
  {
    id: 'start',
    title: 'Getting started',
    topics: [
      {
        id: 'roles',
        title: 'Who can do what',
        roles: BACK,
        summary: 'There are three kinds of account. Buttons you can’t use are hidden or greyed out, and the server checks again.',
        extra: ROLE_TABLE,
      },
      {
        id: 'login',
        title: 'Logging in and passwords',
        roles: ALL,
        summary: 'Log in with your email and password. Forgot it? Use “Forgot password?” on the login page.',
        rules: [
          'Passwords need at least 9 characters, an uppercase letter, a lowercase letter and a special character.',
          'Each email can belong to only one account.',
          'A reset link works once and expires after 1 hour.',
          'After 5 wrong attempts in 15 minutes, wait before trying again.',
        ],
      },
      {
        id: 'money',
        title: 'How amounts are shown',
        roles: ALL,
        summary: 'All amounts are in Indian rupees, grouped the Indian way (₹1,17,068). Prices exclude tax unless the line says otherwise.',
      },
    ],
  },
  {
    id: 'catalog',
    title: 'Catalog',
    topics: [
      {
        id: 'products',
        title: 'Add a product and its variants',
        roles: ADMIN,
        summary: 'Products are what you sell. A variant (for example Brand: Odoo) adds an extra price on top.',
        steps: [
          'Open Products and click New product.',
          'Enter name, type, sales price, cost price and the tax that applies, then Create.',
          'In the same panel, add variants: attribute, value and extra price. The final price is shown for each.',
        ],
        rules: [
          'Prices can’t be negative. Cost price is never shown to customers.',
          'Products are archived, never deleted. Archived products can’t be added to new subscriptions; existing ones keep working.',
          'Changing a price never changes existing subscriptions or invoices. Their prices were fixed when the line was added.',
        ],
        link: { to: '/products', label: 'Open Products' },
      },
      {
        id: 'plans',
        title: 'Create a plan',
        roles: ADMIN,
        summary: 'A plan sets the recurring fee, how often it bills, the minimum quantity, when it’s available, and what customers may do.',
        steps: [
          'Open Plans and click New plan.',
          'Choose Daily, Weekly, Monthly or Yearly, the price per period and the minimum quantity.',
          'Set the dates the plan can be sold.',
          'Switch on what subscriptions may do: auto-close at plan end, close early, pause, renew.',
        ],
        rules: [
          'The end date must be after the start date; minimum quantity is at least 1.',
          'A plan can only be chosen for new subscriptions between its start and end dates.',
          'The plan fee is billed as its own line each period, without tax.',
          'Editing a plan only affects new subscriptions.',
        ],
        link: { to: '/plans', label: 'Open Plans' },
      },
    ],
  },
  {
    id: 'selling',
    title: 'Selling',
    topics: [
      {
        id: 'customers',
        title: 'Add a customer',
        roles: BACK,
        summary: 'Customers can sign up themselves, or you can add them.',
        steps: [
          'Open Customers and click New customer.',
          'Enter the contact name and email, and their billing profile: company, phone, address, GSTIN.',
          'They get an email to set their password, then they can use the customer portal.',
        ],
        rules: ['The billing profile is printed on every new invoice. Old invoices keep the details they were issued with.'],
        link: { to: '/customers', label: 'Open Customers' },
      },
      {
        id: 'templates',
        title: 'Save a quotation template',
        roles: BACK,
        summary: 'Templates are ready-made offers: a plan plus products, valid for a set number of days.',
        steps: ['Open Quotation templates and click New template.', 'Pick the plan, add products and quantities, and how many days a quote stays valid.', 'Use “Use for new subscription” to start from it.'],
        link: { to: '/templates', label: 'Open templates' },
      },
      {
        id: 'subscriptions',
        title: 'Create a subscription and take it live',
        roles: BACK,
        summary: 'Every subscription moves through fixed steps. Only the buttons for valid next steps are shown.',
        steps: [
          'Click New subscription (or New subscription on a customer’s page).',
          'Optionally start from a template, then choose the customer, plan, dates and payment terms, and add products.',
          'Check “Each invoice” on the right, then Save as draft.',
          'Click Send quotation. When the customer agrees, click Confirm.',
          'It becomes Active by itself on the start date (or click Activate now on that day).',
        ],
        rules: [
          'Each product line needs at least the plan’s minimum quantity.',
          'A quotation can’t be confirmed after its “valid until” date. Edit and send it again.',
          'Drafts and quotations can be edited. Once confirmed, they can’t.',
          'Pause, renew and close only work if the plan allows them. A greyed-out button tells you why.',
          'Paused subscriptions are never billed for the paused time.',
          'Renew adds one term to the expiry date. Closing early stops billing; there are no refunds or part-period charges.',
          'Subscriptions close by themselves when they expire, or at plan end if the plan auto-closes.',
        ],
        extra: LIFECYCLE,
        link: { to: '/subscriptions', label: 'Open Subscriptions' },
      },
    ],
  },
  {
    id: 'billing',
    title: 'Billing',
    topics: [
      {
        id: 'run',
        title: 'Billing day',
        roles: BACK,
        summary: 'Invoices are created by the billing run, never typed by hand. It runs every day by itself.',
        steps: ['Open Billing runs and click Run billing now if you need it straight away.', 'Check the result: invoices created, periods skipped, failures. Failures are listed in History.'],
        rules: [
          'Only Active subscriptions are billed. Paused, draft and closed ones are skipped.',
          'Each period is billed exactly once. Running billing twice creates nothing new.',
          'If billing was missed, the next run creates one invoice for each missed period.',
          'Invoices are billed in advance, from the period start. Monthly dates keep the original day (31 Jan → 28 Feb → 31 Mar).',
          'New invoices are confirmed automatically, ready to send.',
        ],
        link: { to: '/billing', label: 'Open Billing runs' },
      },
      {
        id: 'invoice-maths',
        title: 'How an invoice is worked out',
        roles: ALL,
        summary: 'Line amount, minus any discount, plus tax. The plan fee has no tax.',
        rules: [
          'Line amount = quantity × unit price.',
          'Each line gets at most one discount: the biggest one that qualifies.',
          'Tax is worked out after the discount, line by line.',
          'Total = subtotal − discounts + tax. Due date = period start + payment terms.',
          'GST: a customer in Tamil Nadu (or with no GSTIN) pays CGST + SGST, half each. A customer in another state pays IGST. The state comes from the first two digits of their GSTIN.',
          'Each line shows its SAC code, set on the product.',
        ],
      },
      {
        id: 'invoices',
        title: 'Confirm, send, print or cancel an invoice',
        roles: BACK,
        summary: 'Open an invoice to see its lines, totals and payments, and act on it.',
        rules: [
          'Draft invoices can’t be paid or become overdue. Confirm them first (or use Confirm all drafts).',
          'Confirmed invoices can’t be edited.',
          'An invoice with any payment can’t be cancelled. Cancelling returns any discount it used, and the period can be billed again.',
          'An invoice is Overdue when it’s confirmed, past its due date and not fully paid.',
          'If an email fails to send, nothing else changes. Use Resend.',
        ],
        link: { to: '/invoices', label: 'Open Invoices' },
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    topics: [
      {
        id: 'record',
        title: 'Record a payment',
        roles: BACK,
        summary: 'Record money as it arrives, against the invoice it pays.',
        steps: [
          'Open Payments, find the invoice under Waiting for payment, and click Record payment.',
          'The amount is the full balance; change it for a part payment.',
          'Choose the method, the date received and the reference (UTR, UPI ref or cheque number).',
        ],
        rules: [
          'Payments can only go on confirmed invoices.',
          'The amount must be above 0 and can’t be more than the balance due. The date can’t be in the future.',
          'The invoice becomes Paid when payments cover the total.',
        ],
        link: { to: '/payments', label: 'Open Payments' },
      },
      {
        id: 'read',
        title: 'Read a payment from a receipt or message',
        roles: BACK,
        summary: 'Let Brightloop fill in the payment for you from a photo, screenshot, SMS or note.',
        steps: [
          'On Payments, click Read a payment.',
          'Drop in a photo or screenshot, or paste a bank or UPI message, then read it.',
          'Check the highlighted text, the suggested invoice and any field marked Check.',
          'Click Record payment.',
        ],
        rules: [
          'Nothing is saved until you click Record payment.',
          'Printed text and screenshots read best. For handwriting, type the note into the paste box.',
          'The best match uses the invoice number if present, then an exact balance, then the customer’s name.',
        ],
        link: { to: '/payments', label: 'Read a payment' },
      },
      {
        id: 'statement',
        title: 'Import a bank statement',
        roles: BACK,
        summary: 'Match a whole statement at once instead of scrolling through it line by line.',
        steps: [
          'On Payments, click Import bank statement.',
          'Drop the CSV your bank lets you download, or paste rows copied from a statement, then click Match payments.',
          'Each credit shows its suggested invoice: Sure, Check (probably a part payment) or None. Change any match, untick rows you don’t want.',
          'Click Record payments. A summary shows anything that couldn’t be saved.',
        ],
        rules: [
          'Debits, charges and balance rows are ignored.',
          'One statement line pays one invoice, and no invoice is used twice in the same import.',
          'A credit is never recorded for more than the invoice’s balance.',
        ],
        link: { to: '/payments', label: 'Import a statement' },
      },
      {
        id: 'upi',
        title: 'UPI QR on invoices',
        roles: ALL,
        summary: 'Every unpaid invoice carries a UPI QR with the amount and invoice number filled in. Scan it with any UPI app to pay.',
        rules: ['The invoice number travels with the payment, so it’s matched to the right invoice automatically.', 'Once an invoice is paid, the QR disappears.'],
      },
      {
        id: 'reminders',
        title: 'Chase overdue invoices',
        roles: BACK,
        summary: 'Send a payment reminder by email or WhatsApp from the invoice, or email every overdue invoice at once.',
        steps: ['On an invoice, click Remind and choose Email or WhatsApp. WhatsApp opens with the message already written.', 'On Invoices, click Remind all overdue to email everyone who is late.'],
        rules: [
          'Only confirmed invoices with a balance can be chased.',
          'Remind all overdue skips invoices already emailed today.',
          'Every reminder is listed on the invoice and in the audit log.',
          'Reminders get firmer once an invoice is more than 15 days late.',
        ],
        link: { to: '/invoices', label: 'Open Invoices' },
      },
      {
        id: 'void',
        title: 'Void a payment',
        roles: ADMIN,
        summary: 'Undo a payment that shouldn’t count, such as a bounced cheque.',
        steps: ['Open the invoice, find the payment and click Void.', 'Give a reason and confirm.'],
        rules: ['Only the admin can void. A reason is required and it’s recorded in the audit log.', 'If the invoice was Paid, it goes back to Confirmed.'],
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    topics: [
      {
        id: 'dashboard',
        title: 'Reading the dashboard',
        roles: BACK,
        summary: 'One place for active subscriptions, recurring revenue, money collected, outstanding and overdue.',
        rules: [
          'Monthly recurring revenue (MRR): plan fee plus products for every active subscription, before tax and discount, as a monthly figure (yearly ÷ 12, weekly × 52 ÷ 12, daily × 30). ARR is MRR × 12.',
          'Collected: payments received in the chosen months, not counting voided ones.',
          'Outstanding and overdue are always as of today.',
          'Overdue by age groups late invoices into 1–30, 31–60 and over 60 days. Chase the oldest first.',
          'Export CSV downloads the numbers for the filters you’ve chosen.',
          'How recurring revenue moved: start of month, plus new subscriptions, minus pauses and closures, gives today’s MRR.',
          'Ending in the next 30 days lists active subscriptions about to expire, with one-click Renew.',
        ],
        link: { to: '/dashboard', label: 'Open Dashboard' },
      },
    ],
  },
  {
    id: 'admin',
    title: 'Admin',
    topics: [
      {
        id: 'taxes',
        title: 'Taxes',
        roles: ADMIN,
        summary: 'Create tax rates and attach them to products.',
        rules: ['Rates are 0 to 100%.', 'Each invoice keeps the rate it was created with; changes only affect new invoices.'],
        link: { to: '/taxes', label: 'Open Taxes' },
      },
      {
        id: 'discounts',
        title: 'Discounts',
        roles: ADMIN,
        summary: 'Discounts apply on the next invoice by themselves. Nobody has to remember them.',
        steps: [
          'Open Discounts and click New discount.',
          'Choose a percentage or a fixed amount, and whether it applies to specific products or the whole subscription.',
          'Optionally require a minimum quantity or spend, set the dates and a usage limit.',
        ],
        rules: [
          'Only the admin can create or change discounts.',
          'A discount stops when it expires or its usage limit is reached. Turn it off any time with the switch.',
          'Discounts don’t stack: each line gets the single biggest one.',
          'A whole-subscription discount is shared across the lines in proportion to each line.',
          'A fixed discount never takes a line below zero.',
        ],
        link: { to: '/discounts', label: 'Open Discounts' },
      },
      {
        id: 'staff',
        title: 'Staff accounts',
        roles: ADMIN,
        summary: 'Only the admin can add staff. People are deactivated, never deleted, so their history stays.',
        rules: ['You can’t deactivate yourself or the last active admin.', 'Deactivated people can’t log in.'],
        link: { to: '/staff', label: 'Open Staff' },
      },
      {
        id: 'audit',
        title: 'Audit log',
        roles: BACK,
        summary: 'Every status change, payment, void, billing run, and change to discounts, taxes, staff and customers is recorded with who did it and when.',
        link: { to: '/audit', label: 'Open Audit log' },
      },
    ],
  },
  {
    id: 'portal',
    title: 'Your account',
    topics: [
      {
        id: 'pay',
        title: 'What you owe and how to pay',
        roles: CUST,
        summary: 'The top of your page shows what’s due and when. Overdue amounts are highlighted.',
        steps: ['Pay by bank transfer or UPI and quote the invoice number.', 'Your payment shows here once Brightloop records it.', 'Download any invoice as a PDF from the Invoices tab.'],
        link: { to: '/portal?tab=invoices', label: 'My invoices' },
      },
      {
        id: 'manage',
        title: 'Pause, resume, renew or close',
        roles: CUST,
        summary: 'Each subscription card shows when you’re next billed. The ring fills up as the period goes on.',
        rules: [
          'You only see the actions your plan allows.',
          'While paused you aren’t billed, and paused time is never charged.',
          'Renewing adds another term to the end date.',
          'Closing early stops future invoices. There’s no refund for the current period.',
        ],
        link: { to: '/portal', label: 'My subscriptions' },
      },
      {
        id: 'request',
        title: 'Request a new plan',
        roles: CUST,
        summary: 'Browse the plans on offer and send a request. Nothing is billed until Brightloop confirms it.',
        steps: ['Open Browse plans and choose Request this plan.', 'Add the products you need and check the price per period.', 'Send the request. It appears under Subscriptions as a quotation.'],
        link: { to: '/portal?tab=plans', label: 'Browse plans' },
      },
    ],
  },
]

/** /help — available to every role, showing only what applies to them. */
export default function HelpPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const role = user?.role ?? 'CUSTOMER'

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase()
    // Customers see their own section first.
    const ordered = role === 'CUSTOMER' ? [...SECTIONS.filter((s) => s.id === 'portal'), ...SECTIONS.filter((s) => s.id !== 'portal')] : SECTIONS
    return ordered.map((s) => ({
      ...s,
      topics: s.topics.filter(
        (t) =>
          t.roles.includes(role) &&
          (!needle || [t.title, t.summary, ...(t.steps ?? []), ...(t.rules ?? [])].join(' ').toLowerCase().includes(needle)),
      ),
    })).filter((s) => s.topics.length)
  }, [q, role])

  const roleName = role === 'ADMIN' ? 'admins' : role === 'STAFF' ? 'staff' : 'customers'

  return (
    <div>
      <div className="mb-6">
        <Typography.Title level={3}>How to use Brightloop</Typography.Title>
        <Typography.Text type="secondary">The steps for each job and the rules the system follows, written for {roleName}.</Typography.Text>
        <Input
          className="mt-4 flex max-w-md"
          size="large"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search, e.g. pause, discount, overdue"
            aria-label="Search, e.g. pause, discount, overdue"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {!sections.length ? (
        <Empty description={`Nothing matches “${q}”.`} />
      ) : (
        <Row gutter={32}>
          <Col xs={0} lg={6}>
            <div style={{ position: 'sticky', top: 24 }}>
              <Anchor
                offsetTop={24}
                items={sections.map((s) => ({
                  key: s.id,
                  href: `#${s.id}`,
                  title: s.title,
                  children: s.topics.map((t) => ({ key: t.id, href: `#${t.id}`, title: t.title })),
                }))}
              />
            </div>
          </Col>
          <Col xs={24} lg={18}>
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="mb-10">
                <h2 style={{ fontFamily: brand.fontDisplay, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 12px' }}>{s.title}</h2>
                <div className="flex flex-col gap-4">
                  {s.topics.map((t) => (
                    <Card key={t.id} id={t.id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div style={{ maxWidth: 680 }}>
                          <div className="text-base font-semibold">{t.title}</div>
                          <Typography.Paragraph type="secondary" className="mb-0 mt-1">
                            {t.summary}
                          </Typography.Paragraph>
                        </div>
                        {t.link && (
                          <Button size="small" onClick={() => navigate(t.link!.to)}>
                            {t.link.label}
                          </Button>
                        )}
                      </div>

                      {t.steps && (
                        <ol className="mb-0 mt-4 pl-5" style={{ lineHeight: 1.7, maxWidth: 720 }}>
                          {t.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      )}

                      {t.rules && (
                        <div className="mt-4 rounded-md p-4" style={{ background: '#F7F9F8', border: `1px solid ${brand.line}`, maxWidth: 760 }}>
                          <div className="mb-2 text-sm font-semibold" style={{ color: brand.green }}>
                            Rules
                          </div>
                          <ul className="m-0 pl-5 text-sm" style={{ lineHeight: 1.7 }}>
                            {t.rules.map((r) => (
                              <li key={r}>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {t.extra}
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </Col>
        </Row>
      )}
    </div>
  )
}
