# Brightloop Subscription Management System

One place to run a subscription business: products and plans → quotations → subscriptions →
automatic monthly invoices with GST and discounts → payments → a finance dashboard, plus a
self-service portal for customers.

| Folder | What | Stack |
|---|---|---|
| `client/` | Web app (back office + customer portal) | React 19, Vite, TypeScript, Ant Design, Tailwind |
| `server/` | REST API, billing engine, jobs, PDF, email, AI | Node 20, Express, TypeScript, Prisma, PostgreSQL |
| `ml/` | Late-payment risk model (training only) | Python, scikit-learn |
| `docs/` | Backend SRS and design decisions | |

---

## Run it

You need **Node 20+** and **PostgreSQL 14+**.

**1. Postgres (once).** On a Mac with Homebrew:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb brightloop
```

(Or install [Postgres.app](https://postgresapp.com), click Initialize, then run `createdb brightloop`.)

**2. Install and build the demo database (once):**

```bash
npm run setup
```

This creates `server/.env` and `client/.env`, installs everything, creates the tables and loads
a year of demo data (customers, subscriptions, invoices, payments, overdue accounts).

**3. Start both apps:**

```bash
npm run dev
```

Open **http://localhost:5173**. The API runs on port 4000.

### Logins (password for all: `Brightloop@123`)

| Who | Email | Sees |
|---|---|---|
| Admin | `admin@brightloop.dev` | Everything, including taxes, discounts, staff |
| Staff | `staff1@brightloop.dev` | Day-to-day: customers, subscriptions, invoices, payments |
| Customer | `acme@example.com` | The portal: own subscriptions, invoices, payments |
| Customer (overdue) | `finance@kaverifoods.in` | A customer with unpaid invoices |

### Useful commands

| Command | Does |
|---|---|
| `npm run dev` | Starts server and web app together |
| `npm run reset-demo` | Wipes the database and reloads the demo data (dates move with today) |
| `npm test` | Server and client tests |

### No database on the machine you're presenting from?

Set `VITE_USE_MOCKS=true` in `client/.env` and run `cd client && npm run dev`. The web app then
uses built-in demo data, no server needed. Mock logins use password `Demo@12345`
(`admin@brightloop.test`, `staff@brightloop.test`, `customer@brightloop.test`).

### Settings worth knowing (`server/.env`)

- `DEMO_MODE=true` lets the Billing page bill "as of" a future date, to show catch-up billing.
- SMTP: fill in Mailtrap (or any SMTP) details to actually send invoice and reminder emails.
  Without them the app works the same and still logs reminders on the invoice.
- `AI_ENABLED=true` plus `LLM_PROVIDER` and `LLM_API_KEY` turns on the Copilot, reminder drafts
  and invoice explanations. With `false` they fall back to built-in answers.

Your company's name, address, GSTIN and UPI ID (printed on invoices and the UPI QR) are in
`client/.env` (`VITE_COMPANY_*`, `VITE_UPI_ID`).

---

## How the billing stays correct

- Money is integer paise everywhere; rounding is half-up per line.
- The billing run holds a Postgres advisory lock, bills each subscription in its own
  transaction, catches up every missed period, and a unique index on
  (subscription, period start) makes it impossible to bill a period twice.
- Invoice numbers (`INV-YYYY-000001`) are consecutive with no gaps, as GST requires.
- Payments lock the invoice row, can't exceed the balance or be dated in the future, and turn
  the invoice Paid when covered. Only an admin can void one.
- Edits to plans, prices or taxes never change invoices already issued.

---

## 🧠 ML Late-Payment Risk Model

The model is trained using scikit-learn on historical customer billing data to predict late invoice settlement risk.
Features evaluated:
- `customer_late_count`
- `customer_invoice_count`
- `log_amount_paise`
- `payment_terms_days`
- `billing_period` (one-hot: DAILY, WEEKLY, MONTHLY, YEARLY)
- `days_since_signup`
- `prior_partial_payments`

### To Train & Export Model:
```bash
python ml/train.py
```
This script exports `ml/model.json` with standardized weights, intercepts, and metrics. At runtime, Node evaluates risk in under 1ms without a live Python service.

---

## 🧪 Running Tests

```bash
npm test
```

The server suite covers authentication, RBAC, money precision, anchor-day clamping, catalog
rules, state machines, pricing, payments, portal isolation and AI guardrails. The live billing
tests use a separate `test` schema: run `cd server && npx tsx setup_test_db.ts` once first.

---

## 🎬 10-Step Acceptance Demo Script (SRS 10.2)

1. **Authentication & RBAC**:
   - `POST /api/auth/login` as `admin@brightloop.dev`.
   - Access `GET /api/reports/summary`.
2. **Catalog Creation**:
   - Create a product `Brightloop Cloud Backup` (`POST /api/catalog/products`).
   - Add a variant `1TB Storage` with `extraPrice: 50000`.
3. **Quotation & Subscription**:
   - Create quotation template with product and plan.
   - Create subscription in `DRAFT` status (`POST /api/subscriptions`).
4. **Subscription Activation**:
   - Transition: `DRAFT` -> `QUOTATION` -> `CONFIRMED` -> `ACTIVE`.
   - Verify `nextBillingDate` is initialized.
5. **Billing Run**:
   - Run billing (`POST /api/billing/run`) with `asOf: "2026-11-01"`.
   - Verify generated invoice numbers follow `INV-YYYY-XXXXXX`.
6. **Invoice & Pricing Accuracy**:
   - Verify plan fee is isolated on line 1 with 0 tax.
   - Verify discount applied to lines without stacking.
7. **Payment Recording**:
   - Record partial payment (`POST /api/payments`). Invoice remains `CONFIRMED`.
   - Record remaining payment. Invoice automatically transitions to `PAID`.
8. **Payment Voiding**:
   - Admin voids payment (`POST /api/payments/:id/void`).
   - Invoice reverts from `PAID` to `CONFIRMED`.
9. **Customer Portal**:
   - Login as Customer.
   - `GET /api/portal/invoices/:id` loads own invoice; accessing another customer returns 404.
   - `GET /api/documents/:id/pdf` generates formatted PDF.
10. **AI Features**:
   - Late-payment risk score returns badge and top reasons (`GET /api/ai/invoices/:id/risk`).
   - Copilot answers questions without SQL injection (`POST /api/ai/ask`).
   - Overdue reminder draft generated (`POST /api/ai/invoices/:id/reminder`).
   - Customer requests plain-English explanation (`POST /api/ai/portal/invoices/:id/explain`).
