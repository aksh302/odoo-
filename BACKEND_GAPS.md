# Backend ↔ frontend: what's left (checked 31 Oct, 15:45)

Checked `backend-implementation` (commit c9ee81c) running on Postgres with `prisma/seed.ts`,
using `client/scripts/check-api.mjs` plus manual calls. Auth, catalog, subscriptions, payments,
reports and the portal all respond. Nice work on the transactions, constraints and tests.

The frontend now **translates** your paths and shapes (see the bottom table), so you don't need to rename anything.
What it can't translate is endpoints that don't exist. Those are listed first, most important first.

## A. Missing endpoints (frontend screens break without these)

| # | Endpoint | Used by | Response |
|---|---|---|---|
| 1 | `GET /api/invoices?status=&customerId=&subscriptionId=&overdue=true&from=&to=&q=&page=&limit=` | Invoices list, Payments "Waiting for payment", Dashboard overdue table, Read a payment, Bank statement import, Customer page | `{ data, page, limit, total }`. Each row: invoice fields + `subscriptionNumber`, `customerSnapshot`, and derived `overdue` (CONFIRMED, dueDate < today, amountPaid < total). Newest period first. |
| 2 | `GET /api/invoices/:id` | Invoice detail, printable invoice | `{ invoice, lines, payments }` (invoice has `overdue`, `subscriptionNumber`; lines have `discountName` if you can) |
| 3 | `GET /api/billing/runs?page=&limit=` | Billing runs history | `{ data, page, limit, total }` of BillingRun rows, newest first |
| 4 | `GET /api/portal/payments` | Portal "Payments" tab | `{ data, page, limit, total }`, customer's own non-voided payments with `invoiceNumber` |
| 5 | `GET /api/auth/users?q=` (staff + admins) | Staff page | paged User rows (no password hash) |
| 6 | `POST /api/billing/invoices/bulk-confirm` with **no ids = all drafts** | "Confirm all drafts" | currently requires `invoiceIds` (min 1) |
| 7 | `POST /api/invoices/:id/remind { channel: 'EMAIL' \| 'WHATSAPP' }` and `POST /api/invoices/remind-overdue` | Remind button, "Remind all overdue" | `{ invoice }` / `{ sent }`; store `remindedAt`/channel so the history shows |

## B. Edit endpoints (create works, edit doesn't)

| Endpoint | Screen |
|---|---|
| `PUT /api/catalog/plans/:id` (and un-archive) | Plans → Edit / Restore |
| `PUT /api/catalog/taxes/:id` | Taxes → Edit |
| `PUT /api/pricing/discounts/:id` incl. `isActive` | Discounts → Edit, on/off switch |
| `PUT /api/quotations/:id` | Quotation templates → Edit |
| `PUT /api/subscriptions/:id` (only DRAFT / QUOTATION) | Subscription → Edit |
| un-archive product (`isArchived: false`) | Products → Restore |
| `POST /api/auth/users/:id/reactivate` | Staff → reactivate switch |

## C. Small additions

- `GET /api/reports/summary`: add `counts { paid, outstanding, overdue }` and `revenueByMonth: [{ month: 'YYYY-MM', collected }]` (payments by month in the `from`–`to` range). The chart is empty without it. Filters `from`, `to`, `customerId`, `planId` please.
- `GET /api/subscriptions`: add `recurringAmount` (plan price + line amounts, paise) and support `planId` and `q` (number / customer name).
- `q` search on products, customers, discounts, payments, audit.
- `GET /api/payments` rows: add `invoiceNumber` and `customerName`.
- Seed: add a few CONFIRMED and PAID invoices with payments (some overdue) so the demo has data on first open.

## D. Already handled in the frontend (no action needed)

| Frontend calls (SRS 9.6) | Goes to (yours) |
|---|---|
| `/products`, `/plans`, `/taxes`, `/variants` | `/catalog/...` |
| `/templates` | `/quotations` |
| `/customers`, `/users/staff` | `/auth/customers`, `/auth/staff` |
| `PATCH /users/:id/active {false}` | `POST /auth/users/:id/deactivate` |
| `PATCH /subscriptions/:id/status {status}` / `{action:'renew'}` | `POST /subscriptions/:id/transition` / `/renew` |
| `PATCH /invoices/:id/status` | `POST /billing/invoices/:id/confirm` or `/cancel` |
| `/discounts` | `/pricing/discounts` (`products[]` → `productIds`) |
| `/audit`, `/reports/export.csv` | `/reports/audit`, `/reports/csv` |
| `PATCH /portal/subscriptions/:id/status` | `POST /portal/subscriptions/:id/pause` etc. |
| `POST /portal/subscriptions` | `POST /portal/subscriptions/self-subscribe` |
| `/auth/forgot`, `/auth/reset` | `/auth/forgot-password`, `/auth/reset-password` |
| Dates `2026-01-01T00:00:00.000Z` | read as `2026-01-01` |
| `percent: "18"` (Decimal as text) | read as `18` |
| Summary `overdue{count,amount}`, `aging.days_*` | read as `overdueCount`, `overdueAmount`, `aging.d0_30` … |

Also: `variantId: null` from the frontend is stripped before it reaches your zod schemas (they accept `undefined` only).

## How to re-check

```bash
cd client
API_URL=http://localhost:4000/api ADMIN_EMAIL=admin@brightloop.dev ADMIN_PASSWORD='Brightloop@123' npm run check-api
```

## E. Two bugs found while testing (please fix first)

1. **Billing run crashes** — `server/src/modules/billing/service.ts`, around line 165:
   `currentSub.expiryDate` → should be `sub.expiryDate`. With that one-word change the
   billing run creates invoices (including catch-up periods) correctly.
2. **Billing lock can stay held** — the run uses session-level `pg_try_advisory_lock` /
   `pg_advisory_unlock`, but Prisma may run those on different pooled connections, so the
   unlock misses and the next run returns `BILLING_LOCKED`. Fix: take the lock inside a
   transaction with `pg_try_advisory_xact_lock(424242)` (released automatically at commit),
   or lock and unlock on the same connection.

## F. Note on `npm run check-api`
The checker uses the SRS path names, so it lists renamed routes (e.g. `/products` vs
`/catalog/products`) as missing. The app itself translates those (section D) — only the
items in A and B are really missing.
