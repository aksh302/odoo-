Backend SRS — Brightloop Subscription Management System

Oct 31, 2026 · @akshaya

1. Read First

This document specifies the backend (API, database, billing engine, scheduled jobs, AI and ML) of the Brightloop Subscription Management System. It is written for an AI coding agent that has no prior knowledge of the project. Build exactly what is written here; do not add features, endpoints, fields or statuses that are not listed.

1.1 What the product is

Brightloop Software sells everything on subscription: software billed monthly or yearly, add-ons, and products with variants. Today it runs on spreadsheets, hand-typed invoices and manual bank matching, so renewals are missed, invoices go out wrong, and nobody knows the real recurring revenue (MRR). The system replaces this with one platform that runs the whole subscription life:

products and plans → quotation templates → subscriptions → automatic recurring invoices (tax and discounts) → payments → finance dashboard, plus a customer self-service portal.

The heart of the system is the billing run: it creates one invoice per due Active subscription and must never bill a period twice and never skip one, even when triggered twice at once or after the scheduler was down for days.

1.2 Scope

In scope

Out of scope

REST API, PostgreSQL schema, billing engine, scheduled jobs, PDF and email, audit log, AI and ML features (section 7)

Frontend code, payment gateway, accounting ledger, multi-currency, proration, refunds, native apps

1.3 Technology stack

Concern

Choice

Runtime and language

Node.js 20, TypeScript, Express

Database

PostgreSQL with Prisma ORM (plus raw SQL for sequences and a partial index)

Validation and security

zod, helmet, cors, express-rate-limit, jsonwebtoken, bcrypt

Jobs, documents, email

node-cron, PDFKit, Nodemailer (SMTP / Mailtrap)

Tests

Vitest, Supertest

ML

Python 3 and scikit-learn for training only; scoring runs inside Node from an exported model.json. No Python service at runtime.

LLM

Provider-agnostic wrapper (Gemini, Anthropic or OpenAI) selected by env

1.4 Non-negotiable rules for the agent

Money is integer paise. Never use floating point for money. Round half-up per line, using one helper (lib/money.ts).

Every route runs authentication, then the role check, then zod validation. Portal data is filtered by the customerId in the JWT; another customer's record returns 404.

Billing safety is mandatory: Postgres advisory lock, one transaction per subscription, catch-up loop, partial unique index on (subscriptionId, periodStart) ignoring Cancelled invoices, atomic discount usage claim, and a row lock on the invoice when recording payments.

Business dates use Asia/Kolkata; timestamps are UTC. Billing periods are computed from the original anchorDay.

Errors use the shared format and codes in section 6. List endpoints cap limit at 100.

Secrets come from environment variables only. Never log passwords, tokens or API keys. Keep .env.example current.

AI never writes money data. It may read data or draft text for a human to approve. It never creates invoices, records payments, changes statuses or sets prices.

When unsure, choose the simplest option that satisfies this document, write the decision in docs/DECISIONS.md, and continue. Ask the user only if truly blocked.

After every phase (section 8.6) run type-check and tests, fix failures, then report: files changed, tests run, deviations, next step.

1.5 Conventions

IDs FR-x.y and T-n are cross-references. Priority tags: [M] must-have, [S] should-have, [X] stretch. "Shall" marks a testable requirement.

2. Domain Rules

2.1 Roles and permissions

Capability

Admin

Staff

Customer

Create staff, deactivate users

Yes

No

No

Products, variants, plans, taxes, discounts

Create, edit, archive

Read only

Read available plans

Customers and profiles

Yes

Create, edit

Own profile

Quotation templates

Yes

Yes

No

Subscriptions: create, change status

Yes

Yes

Own: pause, resume, renew, close, self-subscribe

Invoices: confirm, cancel, send, PDF

Yes

Yes

Own: view, PDF, explain (AI)

Billing run (manual trigger)

Yes

Yes

No

Payments: record

Yes

Yes

View own

Void a payment

Yes

No

No

Reports and dashboard

Yes

Yes

No

Audit log

Yes

Yes (read)

No

AI: copilot, reminder draft, risk score

Yes

Yes

No

2.2 Status lifecycles

The server rejects any transition not listed. Only Active subscriptions are billed.

Entity

From

Allowed next

Subscription

DRAFT

QUOTATION, CANCELLED

Subscription

QUOTATION

CONFIRMED, CANCELLED

Subscription

CONFIRMED

ACTIVE, CANCELLED

Subscription

ACTIVE

PAUSED, CLOSED

Subscription

PAUSED

ACTIVE, CLOSED

Subscription

CLOSED, CANCELLED

none

Invoice

DRAFT

CONFIRMED, CANCELLED

Invoice

CONFIRMED

PAID (when payments cover total), CANCELLED (only if amountPaid = 0)

Invoice

PAID

CONFIRMED (only through an Admin payment void)

Invoice

CANCELLED

none

Guards and side effects for each transition are in section 5.3.

2.3 Locked design decisions

Topic

Decision

Tax and discount order

Line amount, then discount, then tax. Prices exclude tax.

Money

Integer paise, INR only, half-up rounding per line

Time

Business dates in Asia/Kolkata; timestamps in UTC

Billing timing

In advance: periodStart = nextBillingDate; periodEnd = next period start − 1 day

Plan fee

Billed as its own line each period (description Plan fee - <plan name>, quantity 1, no tax). Product lines use salesPrice + variant.extraPrice, snapshotted when the line is created.

Month-end

Periods are computed from anchorDay, clamped to month length (Jan 31 → Feb 28 → Mar 31)

Edits

Plan, tax and product edits never change existing lines or invoices

Deletion

Users, products, variants and plans are deactivated or archived, never deleted

Discounts

One discount per line, highest value wins; no stacking

Auto-confirm

New invoices are Confirmed on creation when setting auto_confirm_invoices is true (default), otherwise Draft

2.4 Derived values

Value

Definition

Overdue

Invoice status CONFIRMED, dueDate before today (Asia/Kolkata), and amountPaid < total

Outstanding

total − amountPaid summed over CONFIRMED invoices

Revenue collected

Sum of non-voided payment amounts by payment date

Active subscriptions

Count where status = ACTIVE

Recurring amount of a subscription

plan.price + Σ line.amount (pre-tax, pre-discount)

MRR

Σ recurring amount over ACTIVE subscriptions × f(period), with f = daily 30, weekly 52/12, monthly 1, yearly 1/12

ARR

MRR × 12

3. Backend Architecture

A modular monolith: one Express app, one module per domain area, a shared Prisma client, and in-process cron jobs. Business rules live only in services; route handlers parse input, call a service, and return JSON.

3.1 Repository layout

brightloop-sms/  docs/ SRS.md DECISIONS.md  server/    prisma/ schema.prisma  seed.ts  sql/001_constraints.sql    src/      app.ts server.ts config.ts      middleware/ auth.ts rbac.ts validate.ts rateLimit.ts errorHandler.ts      lib/ money.ts dates.ts audit.ts mailer.ts errors.ts pagination.ts           llm.ts risk.ts aiCache.ts prisma.ts      modules/        auth/ catalog/ quotations/ subscriptions/ pricing/ billing/        invoices/ payments/ reports/ portal/ documents/ ai/          (each: routes.ts, service.ts, schemas.ts)      jobs/ billingJob.ts lifecycleJob.ts    tests/ billing.test.ts pricing.test.ts status.test.ts payments.test.ts           rbac.test.ts auth.test.ts reports.test.ts ai.test.ts    ml/ train.py  model.json  requirements.txt  .env.example  README.md

3.2 Modules

Module

Responsibility

auth

Signup, login, reset, JWT, profiles, staff creation, deactivation, customers CRUD

catalog

Products, variants, plans, archive rules

quotations

Templates and template lines

subscriptions

Lines, number sequence, status machine, pause, resume, renew, close

pricing

Taxes, discounts, price calculation, atomic discount claim

billing

Billing run, catch-up loop, advisory lock, BillingRun log

invoices

Lifecycle, numbering, auto-confirm, bulk confirm, cancel rules

payments

Record, void, row lock, overdue and outstanding logic

reports

Summary KPIs, MRR, ARR, aging, CSV export, audit read

portal

Customer-scoped reads and actions, self-subscribe

documents

Invoice PDF (PDFKit), invoice email (Nodemailer)

ai

Risk score exposure, Finance Copilot, reminder drafts, invoice explanation

3.3 Request pipeline

Every request passes through, in order:

helmet, CORS allow-list (CLIENT_URL), JSON body limit 1 MB

Rate limiters where specified (login, forgot-password, AI routes)

requireAuth (verifies the JWT, loads the active user, rejects deactivated users)

requireRole(...roles)

validate(schema) using zod on body, query and params

Route handler, then service, then Prisma

errorHandler converts thrown AppError(code, status, message, fields?) into the standard error body; unknown errors become 500 INTERNAL with no stack trace in the response

Services that change several rows run in prisma.$transaction. Anything that needs a row lock or advisory lock uses prisma.$queryRaw inside that transaction.

3.4 Scheduled jobs

Job

Schedule (env)

Does

billingJob

BILLING_CRON, default 30 1 * * *

Runs the billing engine with runDate = today

lifecycleJob

LIFECYCLE_CRON, default 0 1 * * *

Activates Confirmed subscriptions whose startDate is today or earlier; closes Active or Paused subscriptions whose expiryDate passed, or whose plan has autoClose and endDate passed

Both jobs are timezone Asia/Kolkata and must be safe to run twice.

3.5 Environment variables

Variable

Example

Purpose

DATABASE_URL

postgresql://user:pass@localhost:5432/brightloop

Prisma

JWT_SECRET, JWT_EXPIRES_IN

32+ random chars, 8h

Sessions

CLIENT_URL

http://localhost:5173

CORS and email links

SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM

Mailtrap

Email

BILLING_CRON, LIFECYCLE_CRON

cron strings

Jobs

DEMO_MODE

true

Allows asOf on the billing run

TZ

Asia/Kolkata

Process timezone

PORT

4000

API port

AI_ENABLED

true

Master switch for section 7

LLM_PROVIDER, LLM_API_KEY, LLM_MODEL

gemini, key, model name

LLM access

AI_TIMEOUT_MS, AI_CACHE

8000, true

AI limits

4. Database

19 tables. Money columns are integer paise. @db.Date columns hold business dates. Rows flagged isSynthetic exist only to train and demo the risk model; every report, dashboard figure and billing query must exclude them (isSynthetic = false).

4.1 Prisma schema

generator client { provider = "prisma-client-js" }datasource db { provider = "postgresql"  url = env("DATABASE_URL") }enum Role { ADMIN STAFF CUSTOMER }enum BillingPeriod { DAILY WEEKLY MONTHLY YEARLY }enum SubscriptionStatus { DRAFT QUOTATION CONFIRMED ACTIVE PAUSED CLOSED CANCELLED }enum InvoiceStatus { DRAFT CONFIRMED PAID CANCELLED }enum DiscountType { FIXED PERCENT }enum DiscountScope { PRODUCT SUBSCRIPTION }enum PaymentMethod { CASH BANK_TRANSFER UPI CARD CHEQUE OTHER }model User {  id             Int      @id @default(autoincrement())  name           String  email          String   @unique  passwordHash   String  role           Role  isActive       Boolean  @default(true)  resetTokenHash String?  resetExpires   DateTime?  createdAt      DateTime @default(now())  profile        CustomerProfile?  subscriptions  Subscription[]  invoices       Invoice[]}model CustomerProfile {  userId         Int     @id  user           User    @relation(fields: [userId], references: [id])  company        String?  phone          String?  billingAddress String?  taxId          String?}model Tax {  id       Int      @id @default(autoincrement())  name     String  percent  Decimal  @db.Decimal(5, 2)  products Product[]  lines    SubscriptionLine[]}model Product {  id            Int      @id @default(autoincrement())  name          String  type          String  salesPrice    Int      // paise  costPrice     Int      // paise  notes         String?  taxId         Int?  tax           Tax?     @relation(fields: [taxId], references: [id])  isArchived    Boolean  @default(false)  variants      Variant[]  discountLinks DiscountProduct[]}model Variant {  id         Int     @id @default(autoincrement())  productId  Int  product    Product @relation(fields: [productId], references: [id])  attribute  String  // e.g. Brand  value      String  // e.g. Odoo  extraPrice Int     // paise, e.g. 56000 for INR 560  isArchived Boolean @default(false)  @@unique([productId, attribute, value])}model Plan {  id            Int           @id @default(autoincrement())  name          String  price         Int           // paise per period  billingPeriod BillingPeriod  minQty        Int           @default(1)  startDate     DateTime      @db.Date  endDate       DateTime      @db.Date  autoClose     Boolean       @default(false)  closable      Boolean       @default(true)  pausable      Boolean       @default(true)  renewable     Boolean       @default(true)  isArchived    Boolean       @default(false)  subscriptions Subscription[]  templates     QuotationTemplate[]}model QuotationTemplate {  id           Int    @id @default(autoincrement())  name         String  planId       Int  plan         Plan   @relation(fields: [planId], references: [id])  validityDays Int  lines        TemplateLine[]}model TemplateLine {  id         Int @id @default(autoincrement())  templateId Int  template   QuotationTemplate @relation(fields: [templateId], references: [id])  productId  Int  variantId  Int?  quantity   Int}model Subscription {  id              Int                @id @default(autoincrement())  number          String             @unique   // SUB-2026-000001  customerId      Int  customer        User               @relation(fields: [customerId], references: [id])  planId          Int  plan            Plan               @relation(fields: [planId], references: [id])  status          SubscriptionStatus @default(DRAFT)  quotationDate   DateTime           @db.Date  validUntil      DateTime           @db.Date  startDate       DateTime           @db.Date  expiryDate      DateTime           @db.Date  paymentTerms    Int                @default(15)   // days  anchorDay       Int?               // day-of-month of first billing  nextBillingDate DateTime?          @db.Date  isSynthetic     Boolean            @default(false)  createdAt       DateTime           @default(now())  lines           SubscriptionLine[]  invoices        Invoice[]  @@index([status, nextBillingDate])  @@index([customerId])}model SubscriptionLine {  id             Int          @id @default(autoincrement())  subscriptionId Int  subscription   Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)  productId      Int  variantId      Int?  description    String       // snapshot: product name + variant  quantity       Int  unitPrice      Int          // paise, snapshot = salesPrice + extraPrice  taxId          Int?  tax            Tax?         @relation(fields: [taxId], references: [id])  amount         Int          // quantity * unitPrice}model Discount {  id          Int           @id @default(autoincrement())  name        String  type        DiscountType  value       Int           // paise if FIXED, whole percent 0-100 if PERCENT  minPurchase Int?          // paise  minQty      Int?  startDate   DateTime      @db.Date  endDate     DateTime      @db.Date  usageLimit  Int?  usedCount   Int           @default(0)  scope       DiscountScope  isActive    Boolean       @default(true)  products    DiscountProduct[]}model DiscountProduct {  discountId Int  productId  Int  discount   Discount @relation(fields: [discountId], references: [id])  product    Product  @relation(fields: [productId], references: [id])  @@id([discountId, productId])}model Invoice {  id               Int           @id @default(autoincrement())  number           String        @unique   // INV-2026-000001  subscriptionId   Int  subscription     Subscription  @relation(fields: [subscriptionId], references: [id])  customerId       Int  customer         User          @relation(fields: [customerId], references: [id])  periodStart      DateTime      @db.Date  periodEnd        DateTime      @db.Date  dueDate          DateTime      @db.Date  subtotal         Int           // sum of line amounts  discountTotal    Int  taxTotal         Int  total            Int           // subtotal - discountTotal + taxTotal  amountPaid       Int           @default(0)  status           InvoiceStatus @default(DRAFT)  customerSnapshot Json          // name, company, address, taxId at billing time  emailedAt        DateTime?  isSynthetic      Boolean       @default(false)  createdAt        DateTime      @default(now())  lines            InvoiceLine[]  payments         Payment[]  @@index([status, dueDate])  @@index([customerId])}model InvoiceLine {  id             Int     @id @default(autoincrement())  invoiceId      Int  invoice        Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)  productId      Int?    // null for the plan-fee line  description    String  quantity       Int  unitPrice      Int  amount         Int     // quantity * unitPrice  discountId     Int?  discountAmount Int     @default(0)  taxPercent     Decimal @db.Decimal(5, 2) @default(0)  taxAmount      Int     @default(0)}model Payment {  id          Int           @id @default(autoincrement())  invoiceId   Int  invoice     Invoice       @relation(fields: [invoiceId], references: [id])  method      PaymentMethod  amount      Int           // paise, > 0  date        DateTime      @db.Date  reference   String?  note        String?  voidedAt    DateTime?  voidReason  String?  createdBy   Int?  isSynthetic Boolean       @default(false)  createdAt   DateTime      @default(now())  @@index([invoiceId])  @@index([date])}model BillingRun {  id          Int       @id @default(autoincrement())  startedAt   DateTime  @default(now())  finishedAt  DateTime?  triggeredBy String    // user id or 'cron'  asOf        DateTime  @db.Date  created     Int       @default(0)  skipped     Int       @default(0)  failed      Int       @default(0)  errorLog    Json?}model AuditLog {  id       Int      @id @default(autoincrement())  userId   Int?  action   String   // e.g. SUBSCRIPTION_STATUS, PAYMENT_CREATE, AI_CALL  entity   String  entityId Int  oldValue Json?  newValue Json?  at       DateTime @default(now())  @@index([entity, entityId])}model Setting {  key   String @id  value String}model AiCache {  key       String   @id   // sha256 of feature + normalized input  value     Json  createdAt DateTime @default(now())}

4.2 Raw SQL (apply after prisma migrate, file prisma/sql/001_constraints.sql)

CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;CREATE SEQUENCE IF NOT EXISTS subscription_seq START 1;CREATE UNIQUE INDEX invoices_one_per_period  ON "Invoice" ("subscriptionId", "periodStart") WHERE status <> 'CANCELLED' AND "isSynthetic" = false;ALTER TABLE "Invoice" ADD CONSTRAINT paid_not_over_total CHECK ("amountPaid" >= 0 AND "amountPaid" <= total);ALTER TABLE "Discount" ADD CONSTRAINT discount_percent_range CHECK (type <> 'PERCENT' OR (value BETWEEN 0 AND 100));ALTER TABLE "Discount" ADD CONSTRAINT discount_usage_cap CHECK ("usageLimit" IS NULL OR "usedCount" <= "usageLimit");ALTER TABLE "Payment" ADD CONSTRAINT payment_positive CHECK (amount > 0);INSERT INTO "Setting"(key, value) VALUES ('auto_confirm_invoices', 'true') ON CONFLICT DO NOTHING;

4.3 Performance indexes

Index

Serves

Subscription(status, nextBillingDate)

Billing run selection

Invoice(status, dueDate), Invoice(customerId)

Overdue list, portal

Payment(invoiceId), Payment(date)

Revenue by date

Subscription(customerId)

Portal and filters

Add more only if a test in section 8 shows a query over 2 seconds.

