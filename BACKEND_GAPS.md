# Backend ↔ frontend status

Everything the frontend needs is now on the server (`backend-implementation` branch).
The frontend's `client/src/api/backend.ts` maps the screens' calls onto the server's routes,
so nothing needs renaming on either side.

## Bugs fixed

1. **Billing run crashed** (`billing/service.ts`): `currentSub.expiryDate` → `sub.expiryDate`.
2. **Billing lock could stay held**: the session lock and `pg_advisory_unlock` could run on two
   different pooled connections, so later runs said `BILLING_LOCKED`. The run now holds
   `pg_try_advisory_xact_lock(424242)` inside one transaction, which Postgres releases by
   itself when the run ends (even on a crash).
3. **`npm run build` failed** on a missing type in `pricing/service.ts`. Fixed; `tsc` is clean.

## Endpoints added

| Area | Endpoint | Notes |
|---|---|---|
| Invoices | `GET /api/billing/invoices` | `?status, customerId, subscriptionId, overdue=true, from, to, q`. Rows include `subscriptionNumber`, `overdue`, `reminders` |
| | `GET /api/billing/invoices/:id` | `{ invoice, lines, payments }`; lines carry `discountName` |
| | `POST /api/billing/invoices/confirm-drafts` | `{ invoiceIds? }`; no ids = every draft |
| | `POST /api/billing/invoices/:id/remind` | `{ channel: 'EMAIL' \| 'WHATSAPP' }`; EMAIL is sent by the server |
| | `POST /api/billing/invoices/remind-overdue` | emails each overdue invoice, at most once a day |
| Billing | `GET /api/billing/runs` | run history; `errorLog` shows subscription numbers |
| Payments | `GET /api/payments` | now also `?customerId, from, to, q`; rows include `invoiceNumber`, `customerName` |
| | `POST /api/payments`, `POST /api/payments/:id/void` | now also return the updated `invoice` |
| Portal | `GET /api/portal/payments` | the customer's own, voided ones hidden |
| | `GET /api/portal/invoices`, `/:id` | same shape as the staff view, own invoices only |
| Staff | `GET /api/auth/users` | admins and staff, `?q` |
| | `POST /api/auth/users/:id/reactivate` | deactivating the last active admin is now blocked |
| Edits | `PUT /api/catalog/taxes/:id`, `PUT /api/catalog/variants/:id`, `PUT /api/catalog/plans/:id` | |
| | `POST /api/catalog/products/:id/restore`, `POST /api/catalog/plans/:id/restore` | undo archive |
| | `PUT /api/quotations/:id` | `lines` replaces all lines |
| | `PUT /api/pricing/discounts/:id` | `productIds` replaces the list; `usedCount` never changes |
| | `PUT /api/subscriptions/:id` | Draft and Quotation only; prices re-snapshotted |
| Reports | `GET /api/reports/summary` | now `?customerId, planId, from, to`, plus `counts`, `revenueByMonth`, `mrrMovement` |

## Good to know

- **Reminders** are stored as `INVOICE_REMIND` audit entries, so no migration was needed.
- **Email** (invoice send, reminders) needs real SMTP details in `server/.env`. Without them
  the reminder is still logged on the invoice, but nothing is delivered.
- **Revenue collected** on the summary now covers the chosen date range (default: the last
  12 months) instead of all time, to match the dashboard's date filter.
- `npm run check-api` checks SRS path names, so it lists renamed routes (e.g. `/products` vs
  `/catalog/products`) as missing. They aren't; the frontend translates them.
