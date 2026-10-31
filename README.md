# Brightloop Subscription Management System (SMS) — Backend & AI

Brightloop Software backend and AI features for recurring subscription management, automated billing runs, and AI financial copilots.

## 🛠️ Stack & Architecture
- **Runtime**: Node.js 20, TypeScript, Express (Modular Monolith)
- **Database**: PostgreSQL with Prisma ORM
- **Security & Validation**: Zod, Helmet, CORS allow-list, Express-Rate-Limit, BCrypt, JWT
- **Jobs & Documents**: node-cron, PDFKit, Nodemailer
- **Testing**: Vitest + Supertest
- **ML / AI**: scikit-learn for Logistic Regression training, in-process Node.js runtime scoring (`ml/model.json`), provider-agnostic LLM interface (Gemini, Anthropic, OpenAI) with strict guardrails and fallbacks.

---

## 🚀 Setup Instructions

### 1. Environment Configuration
Copy `.env.example` to `server/.env` and configure your credentials:
```bash
cp server/.env.example server/.env
```

Key environment variables:
- `DATABASE_URL`: PostgreSQL connection string (e.g. `postgresql://user:password@localhost:5432/brightloop`)
- `JWT_SECRET`: Random 32+ character string
- `CLIENT_URL`: Allowed frontend origin (`http://localhost:5173`)
- `DEMO_MODE`: Set to `true` to allow `asOf` overrides during billing runs
- `TZ`: `Asia/Kolkata`
- `AI_ENABLED`: `true`
- `LLM_PROVIDER`: `gemini` | `anthropic` | `openai`
- `LLM_API_KEY`: API key for the chosen provider

### 2. Install Dependencies & Build
```bash
cd server
npm install
npm run build
```

### 3. Database Migration & Seed
```bash
# Push schema to database
npx prisma db push

# Apply SQL sequences, constraints, and initial settings
# (Executed automatically by seed script)
npm run seed

# Seed with load testing (10k subscriptions, ~1k due) and synthetic ML history:
npm run seed -- --load --synthetic-history
```

Default credentials:
- **Admin**: `admin@brightloop.dev` / `Brightloop@123`
- **Staff**: `staff1@brightloop.dev` / `Brightloop@123`

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
cd server
npm test
```
All 10 test suites covering authentication, RBAC, money precision, anchorDay clamping, catalog rules, state machines, billing correctness, payments, portal isolation, and AI guardrails are green.

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

