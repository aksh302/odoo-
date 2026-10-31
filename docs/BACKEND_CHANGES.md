# Backend: changes after the first implementation

What was added or fixed in `server/` so the full web app runs on the real API.
The frontend's `client/src/api/backend.ts` maps the screens' calls onto these routes.

## Bugs fixed

| Where | Problem | Fix |
|---|---|---|
| Billing run | Crashed on `currentSub.expiryDate` (undefined variable) | `sub.expiryDate` |
| Billing lock | Session advisory lock and unlock could land on different pooled connections, so the lock stayed held and later runs said `BILLING_LOCKED` | Whole run holds `pg_try_advisory_xact_lock` in one transaction; Postgres releases it when the run ends, even on a crash |
| Billing + discounts | When a discount hit its usage limit mid-run, the subscription failed and the customer got no invoice | Bills without that discount (next best, or none) and carries on |
| Invoice numbers | Each run reserved a block of numbers and threw the unused ones away, leaving gaps | Unused numbers are handed back; the series stays consecutive, as GST requires |
| Seed | Every SQL statement with a comment above it was skipped, so the "one invoice per period" unique index, the invoice sequence and two CHECK constraints were never created | Comment lines are stripped, the SQL under them runs |
| Login rate limit | Counted successful logins, so switching accounts 10 times locked everyone out for 15 minutes | Only failed attempts count |
| Payments | Accepted payment dates in the future | Rejected with a field error |
| Product list | Customers could see `costPrice` | Hidden for customers |
| Self-subscribe | Arrived as Draft; plan dates and minimum quantity weren't checked | Arrives as Quotation; expired plans and quantities below the plan minimum are rejected (also for staff) |
| Discount filter | `usageLimit === null` treated a missing limit as used up | `== null` |
| Build | `npm run build` failed on an implicit `any` | Typed |

## Endpoints added

| Area | Endpoint | Notes |
|---|---|---|
| Invoices | `GET /api/billing/invoices` | `?status, customerId, subscriptionId, overdue=true, from, to, q`; rows include `subscriptionNumber`, `overdue`, `reminders` |
| | `GET /api/billing/invoices/:id` | `{ invoice, lines, payments }`; lines carry `discountName` |
| | `POST /api/billing/invoices/confirm-drafts` | `{ invoiceIds? }`; no ids = every draft |
| | `POST /api/billing/invoices/:id/remind` | `{ channel: 'EMAIL' \\| 'WHATSAPP' }`; EMAIL is sent by the server |
| | `POST /api/billing/invoices/remind-overdue` | Emails each overdue invoice, at most once a day |
| Billing | `GET /api/billing/runs` | Run history; `errorLog` shows subscription numbers |
| Payments | `GET /api/payments` | Also `?customerId, from, to, q`; rows include `invoiceNumber`, `customerName` |
| | `POST /api/payments`, `POST /api/payments/:id/void` | Also return the updated `invoice` |
| Portal | `GET /api/portal/payments` | Own payments, voided ones hidden |
| | `GET /api/portal/invoices`, `/:id` | Same shape as the staff view, own invoices only |
| Staff | `GET /api/auth/users` | Admins and staff, `?q` |
| | `POST /api/auth/users/:id/reactivate` | Deactivating the last active admin is blocked |
| Edits | `PUT /api/catalog/taxes/:id`, `/variants/:id`, `/plans/:id` | |
| | `POST /api/catalog/products/:id/restore`, `/plans/:id/restore` | Undo archive |
| | `PUT /api/quotations/:id` | `lines` replaces all lines |
| | `PUT /api/pricing/discounts/:id` | `productIds` replaces the list; `usedCount` never changes |
| | `PUT /api/subscriptions/:id` | Draft and Quotation only; prices re-snapshotted |
| Subscriptions | `GET /api/subscriptions` | Also `?planId, q, expiringWithin` (days) |
| Reports | `GET /api/reports/summary` | `?customerId, planId, from, to`; adds `counts`, `revenueByMonth`, `mrrMovement` |
| | `GET /api/reports/audit` | `?entity, q`; rows include `userName` and `entityLabel`; newest first by time |

## Other changes

- Invoices keep the customer's phone in `customerSnapshot` (for WhatsApp reminders).
- Reminders are stored as `INVOICE_REMIND` audit entries, so no migration was needed.
- Revenue collected on the summary covers the chosen date range (default: last 12 months).
- `prisma/demo.ts` (`npm run seed -- --demo`): a year of history built with the real billing
  engine and payment service, relative to today.
- Scripts: `db:setup`, `db:reset`, `postinstall: prisma generate`; root `npm run setup` / `npm run dev`.
