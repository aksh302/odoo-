# Brightloop — Subscription Management System

Brightloop runs a subscription business end to end: products and plans → quotations → subscriptions → automatic recurring invoices with GST and discounts → payments → a finance dashboard, plus a self-service portal for customers.

![Dashboard](docs/screenshots/dashboard.jpg)

| Customer invoice with UPI QR and GST | Payment read from a receipt photo |
|---|---|
| ![Invoice](docs/screenshots/invoice.jpg) | ![Read a payment](docs/screenshots/read-payment.jpg) |
| **Bank statement matched to invoices** | **Customer portal** |
| ![Statement import](docs/screenshots/statement.jpg) | ![Portal](docs/screenshots/portal.jpg) |

---

## Contents

- [What it does](#what-it-does)
- [Run it](#run-it)
- [How it is built](#how-it-is-built)
- [How billing stays correct](#how-billing-stays-correct)
- [API](#api)
- [Project structure](#project-structure)
- [Tests](#tests)
- [Late-payment risk model](#late-payment-risk-model)

---

## What it does

| Area | Features |
|---|---|
| **Catalog** | Products with variants (extra price per variant), taxes (GST 5/12/18%), plans (daily, weekly, monthly, yearly) with rules: minimum quantity, pause, close early, renew, auto-close. Archive and restore. |
| **Selling** | Customers with GSTIN and billing profile. Quotation templates. Subscriptions move Draft → Quotation → Confirmed → Active → Paused / Closed, with only valid transitions allowed. Live invoice estimate while editing. |
| **Billing** | A daily billing run creates one invoice per due subscription, catches up missed periods, applies the best discount per line and GST (CGST + SGST inside the state, IGST across states). Draft or auto-confirmed invoices, consecutive invoice numbers. |
| **Invoices** | Detail with lines, discount, tax, balance; UPI QR with the amount filled in; printable GST tax invoice and PDF; email and WhatsApp reminders with history; overdue tracking. |
| **Payments** | Record full or part payments; admins can void with a reason. **Read a payment** from a receipt photo, UPI SMS or note (read in the browser). **Import a bank statement** and match every credit to its invoice. |
| **Customer portal** | Customers see their balance and overdue invoices, pay by UPI, download PDFs, pause, resume, renew or close subscriptions, and request new plans (arrive as quotations). |
| **Finance dashboard** | Active subscriptions, MRR and ARR, revenue collected by month, outstanding, overdue by age, how MRR moved this month (new / paused / closed), renewals due in 30 days, CSV export. |
| **Admin** | Discounts with limits and dates, staff accounts, full audit log (who did what, on which record, when), in-app "How to use" guide. |

**Roles:** Admin (everything), Staff (selling, billing, payments; catalog read-only), Customer (own data only, in the portal).

---

## Run it

You need **Node 20+** and a **PostgreSQL** database (local, or hosted on [Neon](https://neon.tech)).

```bash
# 1. Install everything and create the settings files (server/.env, client/.env)
npm run setup

# 2. Point the server at your database: edit DATABASE_URL in server/.env
#    Neon:  postgresql://USER:PASSWORD@ep-xxxx.region.aws.neon.tech/brightloop?sslmode=require
#    Local: postgresql://localhost:5432/brightloop

# 3. Create the tables and load a year of demo data
npm --prefix server run db:setup

# 4. Start the API (port 4000) and the web app (port 5173) together
npm run dev
```

Open **http://localhost:5173**. When the server starts, its terminal says whether the database is connected, and what to fix if not.

### Demo logins (password `Brightloop@123`)

| Role | Email |
|---|---|
| Admin | `admin@brightloop.dev` |
| Staff | `staff1@brightloop.dev` |
| Customer (has overdue invoices) | `finance@kaverifoods.in` |
| Customer | `acme@example.com` |

### Commands

| Command | Does |
|---|---|
| `npm run setup` | Installs server and client, creates `.env` files, creates tables, loads demo data |
| `npm run dev` | Starts the API and the web app together |
| `npm run reset-demo` | Wipes the database and reloads the demo data (dated around today) |
| `npm test` | Server and client tests |

### Settings (`server/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Login sessions (setup generates a random secret) |
| `DEMO_MODE` | `true` lets the Billing page bill "as of" a future date to show catch-up billing |
| `SMTP_*`, `MAIL_FROM` | Email for invoices and reminders (optional; reminders are still logged without it) |
| `AI_ENABLED`, `LLM_PROVIDER`, `LLM_API_KEY` | Optional copilot, reminder drafts and invoice explanations |
| `BILLING_CRON`, `LIFECYCLE_CRON` | Daily schedules (Asia/Kolkata) |

Company name, address, GSTIN and UPI ID printed on invoices are in `client/.env` (`VITE_COMPANY_*`, `VITE_UPI_ID`).
`VITE_USE_MOCKS=true` runs the web app on built-in sample data with no server (logins `admin@brightloop.test` / `Demo@12345`).

---

## How it is built

```mermaid
flowchart LR
    subgraph Browser
        UI["React 19 + TypeScript<br/>Ant Design, Tailwind<br/>(client/)"]
        OCR["Receipt reading<br/>(Tesseract, in browser)"]
    end
    subgraph API["Express API (server/)"]
        MW["helmet · CORS · rate limits<br/>JWT auth → role check → zod validation"]
        MOD["modules: auth · catalog · quotations ·<br/>subscriptions · pricing · billing ·<br/>payments · reports · portal · documents · ai"]
        JOBS["node-cron jobs<br/>billing run · lifecycle"]
    end
    DB[("PostgreSQL<br/>Prisma ORM")]
    MAIL["SMTP email"]
    UI -->|"/api (JSON)"| MW --> MOD --> DB
    JOBS --> MOD
    MOD --> MAIL
    OCR --> UI
```

| Layer | Stack |
|---|---|
| Frontend | React 19, Vite, TypeScript, Ant Design 6, Tailwind 4, React Router 7, Recharts, Tesseract.js |
| Backend | Node 20, Express, TypeScript, Prisma, zod, JWT + bcrypt, node-cron, PDFKit, Nodemailer |
| Database | PostgreSQL (Neon), raw SQL for sequences, partial unique index and CHECK constraints |
| Tests | Vitest (server and client) |

Money is stored and sent as **integer paise** everywhere. Business dates use Asia/Kolkata.

---

## How billing stays correct

- **Never billed twice:** the run holds a Postgres advisory lock, bills each subscription in its own transaction, and a unique index on (subscription, period start) makes a duplicate invoice impossible at the database level.
- **Never skipped:** if the scheduler was down, the next run catches up every missed period. Month-end dates follow the original anchor day (Jan 31 → Feb 28 → Mar 31).
- **Discounts:** the best discount per line wins (no stacking); usage limits are claimed atomically, and when a limit runs out mid-run the invoice is still created without it.
- **Consecutive invoice numbers** (`INV-YYYY-000001`), as GST requires.
- **Payments** lock the invoice row, can't exceed the balance or be dated in the future, and mark the invoice Paid when covered. Only admins can void one.
- **Snapshots:** prices, tax and the customer's details are copied onto lines and invoices, so later edits never change what was billed.
- **Audit log** records every change with who, what and when.

---

## API

All routes are under `/api`, JSON, `Authorization: Bearer <token>`. List endpoints return `{ data, page, limit, total }`; errors return `{ error: { code, message, fields? } }`.

| Module | Main endpoints |
|---|---|
| auth | `POST /auth/signup`, `/login`, `/forgot-password`, `/reset-password` · `GET /auth/me` · customers CRUD `/auth/customers` · staff `POST /auth/staff`, `GET /auth/users`, `POST /auth/users/:id/deactivate` / `reactivate` |
| catalog | `/catalog/products` (+ `/archive`, `/restore`), `/catalog/variants`, `/catalog/plans` (+ `/archive`, `/restore`), `/catalog/taxes` |
| quotations | `GET/POST /quotations`, `PUT /quotations/:id` |
| subscriptions | `GET /subscriptions?status&customerId&planId&q&expiringWithin`, `POST`, `PUT /:id`, `POST /:id/transition`, `/pause`, `/resume`, `/renew`, `/close` |
| pricing | `GET/POST /pricing/discounts`, `PUT /pricing/discounts/:id` |
| billing | `POST /billing/run`, `GET /billing/runs`, `GET /billing/invoices`, `GET /billing/invoices/:id`, `POST …/confirm`, `…/cancel`, `/confirm-drafts`, `…/:id/remind`, `/remind-overdue` |
| payments | `GET/POST /payments`, `POST /payments/:id/void` |
| documents | `GET /invoices/:id/pdf`, `POST /invoices/:id/send` |
| reports | `GET /reports/summary`, `/aging`, `/overdue`, `/csv`, `/audit` |
| portal | `/portal/profile`, `/portal/subscriptions` (+ `self-subscribe`, pause, resume, renew, close), `/portal/invoices`, `/portal/payments` |
| ai | `POST /ai/ask`, `GET /ai/invoices/:id/risk`, `POST /ai/invoices/:id/reminder`, `POST /ai/portal/invoices/:id/explain` |

Full details: [`docs/SRS.md`](docs/SRS.md) and [`docs/BACKEND_CHANGES.md`](docs/BACKEND_CHANGES.md).

---

## Project structure

```
├── client/                 React web app
│   ├── src/pages/          one file per screen (dashboard, invoices, portal, …)
│   ├── src/components/     shared UI (payment reader, statement import, UPI QR, …)
│   ├── src/api/            API client, error messages, route mapping, mock data
│   └── src/lib/            money, GST, dates, statement parsing (with tests)
├── server/                 Express API
│   ├── src/modules/        one folder per area: routes.ts, schemas.ts, service.ts
│   ├── src/jobs/           daily billing and lifecycle jobs
│   ├── src/lib/            money, dates, audit, errors, mailer
│   ├── prisma/             schema, migrations, constraints SQL, seed + demo data
│   └── tests/              Vitest suites
├── ml/                     risk model training (scikit-learn → model.json)
├── docs/                   SRS, decisions, changes, screenshots
└── DEMO.md                 8-minute demo script
```

---

## Tests

```bash
npm test
```

The server suite covers authentication, roles, money precision, anchor-day dates, catalog rules, status transitions, pricing and discounts, payments, portal isolation and AI guardrails. The client suite covers money formatting, GST splits, reminders and bank statement parsing. The live billing tests use a separate `test` schema: run `cd server && npx tsx setup_test_db.ts` once first.

---

## Late-payment risk model

A logistic regression trained with scikit-learn on billing history predicts which invoices are likely to be paid late. Features: `customer_late_count`, `customer_invoice_count`, `log_amount_paise`, `payment_terms_days`, `billing_period` (one-hot), `days_since_signup`, `prior_partial_payments`.

```bash
python ml/train.py
```

This exports `ml/model.json` (standardised weights, intercept, metrics). The server scores invoices from it in under a millisecond, with no Python service at runtime.
