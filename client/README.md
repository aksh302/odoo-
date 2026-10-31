# Brightloop — Frontend (client/)

React + Vite + TypeScript + Ant Design + Tailwind, built to SRS v1.1 sections 7.1, 9.6 and 9.7.

## Run it

```bash
cd client
npm install
cp .env.example .env      # VITE_USE_MOCKS=true by default
npm run dev               # http://localhost:5173
```

**Mock mode** (no backend needed) — log in with password `Demo@12345`:

| Email | Role | Lands on |
|---|---|---|
| admin@brightloop.test | ADMIN | /dashboard (full menu) |
| staff@brightloop.test | STAFF | /dashboard (no Taxes, Discounts, Staff) |
| customer@brightloop.test | CUSTOMER | /portal |

**Real API:** set `VITE_USE_MOCKS=false`. Calls to `/api` are proxied to `http://localhost:4000`
(change the port in `vite.config.ts` if Akshaya's server uses another).

## What's done

| File | What it does |
|---|---|
| `src/api/client.ts` | The one axios instance: adds `Bearer` token, redirects to /login on 401 |
| `src/api/mock/` | Fake API in the exact SRS 9.6 shapes, with role checks and validation errors. One file per area (`auth.ts`, `catalog.ts`); register new files in `mock/index.ts` |
| `src/api/catalog.ts` | Product, variant, plan and tax API calls |
| `src/components/MoneyInput.tsx` | Rupee input whose form value is paise — use for every price field |
| `src/api/errors.ts` | `parseError()` turns `{ error: { code, message, fields } }` into friendly text; `applyFieldErrors()` puts field errors under form inputs |
| `src/auth/AuthContext.tsx` | `useAuth()` → `user`, `login`, `signup`, `logout`; restores session via `/auth/me` |
| `src/auth/ProtectedRoute.tsx` | Role-gated routes; wrong role → own home page |
| `src/lib/money.ts` | `formatINR(paise)`, `toPaise(rupees)`, `toRupees(paise)` — **API money is always integer paise** |
| `src/lib/password.ts` | FR-1.3 password rule, same as the API |
| `src/components/StatusBadge.tsx` | Subscription and invoice badges in the SRS colours, plus Overdue outline |
| `src/hooks/usePagedList.ts` | Server-side pagination + debounced search for any list endpoint |
| `src/components/AppLayout.tsx` | Back-office sidebar (menu filtered by role) and the portal layout |
| `src/pages/auth/*` | Login, Signup (with profile fields), Forgot, Reset — complete |
| `src/pages/CustomersPage.tsx` | **Worked example of a list page** — copy this pattern |
| `src/pages/ProductsPage.tsx` | Products table, create/edit drawer, variant editor (Odoo +₹560), archive/restore; read-only for Staff |
| `src/pages/TemplatesPage.tsx` | Quotation templates: list, editor drawer with product lines and a per-invoice estimate, "Use for new subscription" |
| `src/pages/SubscriptionsPage.tsx` | Status tabs, search, plan filter, Next invoice column with the cycle ring |
| `src/pages/SubscriptionFormPage.tsx` | New / edit (Draft and Quotation only): template, customer, plan, dates, terms, lines, live invoice estimate |
| `src/pages/SubscriptionDetailPage.tsx` | Lifecycle steps, only-valid status buttons (disabled ones explain why), billing ring, lines with tax and totals, invoices |
| `src/pages/InvoicesPage.tsx` | Status tabs, period range, overdue toggle, select drafts and confirm, Confirm all drafts |
| `src/pages/InvoiceDetailPage.tsx` | Balance card, bill-to, lines with discount and tax, totals, payments (Admin can void), Confirm / Record payment / Send / Download PDF / Print / Cancel |
| `src/pages/InvoicePrintPage.tsx` | A4 printable tax invoice; also stands in for the PDF in mock mode |
| `src/pages/BillingPage.tsx` | Run billing (with "Bill as of" date in demo mode), result counts, run history with failure log |
| `src/pages/PaymentsPage.tsx` | "Waiting for payment" with Record payment, and "Received" with date filter |
| `src/components/RecordPaymentModal.tsx` | Method, amount (defaults to balance, part payments allowed), date, reference |
| `src/pages/DashboardPage.tsx` | KPI tiles (active, MRR with ARR, collected, outstanding, overdue), revenue-by-month chart, overdue aging, overdue invoices with Record payment, filters, CSV export |
| `src/pages/PortalPage.tsx` | Customer portal: balance banner, subscription cards with ring and pause/resume/renew/close (by plan flags), invoices with PDF, payments, browse plans and request one |
| `src/pages/CustomersPage.tsx` / `CustomerDetailPage.tsx` | Customer list, create/edit drawer (billing profile, GSTIN), detail with MRR, balance, subscriptions and invoices, "New subscription" prefilled |
| `src/pages/admin/TaxesPage.tsx` | Tax rules (Admin) |
| `src/pages/admin/DiscountsPage.tsx` | Discounts: percent or fixed, products or whole subscription, min qty / spend, dates, usage limit with progress, on/off |
| `src/pages/admin/StaffPage.tsx` | Add staff (Admin only), deactivate / reactivate; last admin and yourself are protected |
| `src/pages/admin/AuditPage.tsx` | Who changed what: status changes, payments, voids, billing runs, discounts, taxes, staff, customers |
| `src/components/ReadPaymentDrawer.tsx` | **Read a payment** (Payments page): photo/screenshot of a receipt or a pasted UPI/bank SMS or note → reads amount, date, UTR, method, invoice number → matches the unpaid invoice → staff confirm and record |
| `src/lib/paymentParser.ts` | Pulls payment details out of text and ranks matching invoices (invoice number, exact balance, customer name) |
| `src/lib/ocr.ts` | In-browser OCR (Tesseract). Engine files are copied to `public/ocr` by `scripts/setup-ocr.mjs` on `npm install`, so it works offline |
| `src/pages/HelpPage.tsx` | In-app rule book ("How to use" in the sidebar and portal header): steps and business rules for each job, filtered by role, searchable, with links to each screen |
| `src/lib/cycle.ts` | Billing-period maths (anchor day), cycle progress, and the allowed status actions from SRS 9.5 |
| `src/pages/PlansPage.tsx` | Plans table with availability status, filters, create/edit modal with period, dates and the four lifecycle switches |
| `src/routes.tsx` | Every route from SRS 9.7. Not-yet-built pages show a placeholder listing what to build |

## Brand

Brightloop's look lives in `src/brand/`. Change colours and fonts there, not in pages.

| Token | Hex | Use |
|---|---|---|
| Pine | #16352C | Sidebar, login panel |
| Green | #1F6B52 | Buttons, links, active items |
| Marigold | #E9A23B | Anything due or renewing soon |
| Mint | #9FD8BF | Done / billed, on dark backgrounds |
| Sage | #F2F5F3 | App background |

Fonts: Bricolage Grotesque (headings, wordmark) and Onest (everything else), bundled via @fontsource so they work offline.
`<CycleRing progress={0.6} dueSoon label="3d" />` shows how far through its billing period something is. Use it on Subscriptions and the portal.

## Building a new page (pattern)

1. Create `src/pages/XPage.tsx` (copy `CustomersPage.tsx` for lists).
2. Fetch with `usePagedList<T>('/x', filters)` or `api.get/post` from `src/api/client.ts`.
3. Show money with `formatINR`, statuses with the badge components.
4. On submit errors: `applyFieldErrors(form, err)`; otherwise `message.error(parseError(err).message)`.
5. Add a mock handler in `src/api/mock/<area>.ts` for the endpoint so it works before the backend.
6. Swap the `<P … />` placeholder in `src/routes.tsx` for your page.

## Suggested build order

1. Auth ✅ → 2. Products ✅, Plans ✅, Customers ✅ → 3. Subscriptions ✅ + Templates ✅ → 4. Invoices ✅, Billing ✅, Payments ✅ →
5. Portal ✅ → 6. Dashboard ✅ → 7. Taxes ✅, Discounts ✅, Staff ✅, Audit log ✅

All screens in SRS 9.7 are built.

## Notes for the backend (Akshaya)

- The template editor uses `PUT /templates/:id` (same body as `POST /templates`). It isn't in SRS 9.6 yet.
- The subscription list expects each row to include `customer` (id, name, email, company), the full `plan`,
  and `recurringAmount` (plan price + line amounts, pre-tax, in paise).
- Field errors for lines use keys like `lines.0.quantity`; the form puts them under the right row.
- `GET /invoices` rows should include `subscriptionNumber`, `customerSnapshot` and the derived `overdue` flag.
- `GET /payments` rows should include `invoiceNumber` and `customerName`.
- Invoice lines can carry `discountName` so the UI can show which discount applied.
- Portal: customers need `GET /plans?available=true` and `GET /products` (without `costPrice`) to browse and request plans.
- Portal: the printable invoice uses `GET /portal/invoices/:id` (same shape as `GET /invoices/:id`, own invoices only). Not in SRS 9.6 yet.
- `POST /portal/subscriptions` is sent as `{ planId, quantity, lines }` and should create a QUOTATION.
- Admin screens use three endpoints not in SRS 9.6 yet: `PUT /taxes/:id`, `GET /users?q=` (staff and admins, paged) and `GET /customers/:id` returning `{ customer, subscriptions, invoices }`.
- `GET /audit` rows: `{ id, at, userName, action, entity, entityId, entityLabel, oldValue, newValue }`. Action names are listed in `AuditPage.tsx`.
- Discounts are sent with `productIds` (empty for SUBSCRIPTION scope); `usedCount` is read only.
