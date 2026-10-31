# Brightloop demo script (about 8 minutes)

Runs on the real server and database. Before you start:

1. In the project folder: `npm run reset-demo` (fresh demo data, dated around today), then `npm run dev`.
2. Open http://localhost:5173 a minute early and log in once: Neon's free database sleeps when idle,
   so the very first page can take a few seconds.

| Account | Email | Password |
|---|---|---|
| Admin | admin@brightloop.dev | Brightloop@123 |
| Staff | staff1@brightloop.dev | Brightloop@123 |
| Customer (has overdue invoices) | finance@kaverifoods.in | Brightloop@123 |

Tip: open the customer in a private/incognito window so you can switch without logging out.

---

## 1. The problem (30 s, no clicks)

> Brightloop sells software on subscription. Today renewals are remembered by whoever notices,
> invoices are typed by hand, and payments are matched by scrolling bank statements.
> We built one system that runs the whole month.

## 2. Admin sets up a plan (1 min) — log in as **admin**

1. **Login page**: point at the ring. *"Every dot is a renewal: mint are billed, marigold are due."*
2. **Products → Brightloop ERP**: show the variants (5 Users, 25 Users **+₹1,000**, Unlimited **+₹3,000**)
   and the final price worked out.
3. **Plans → New plan**: Monthly, ₹1,999, minimum 5 seats. Switch Pause on, Close early off. Create.
   *"The plan decides what customers are allowed to do later."*

## 3. Staff sells it (1.5 min) — still admin is fine, or log in as **staff**

1. **Customers → New customer**: "Nila Bakers", any email, GSTIN `29ABCDE1234F1Z5` (Karnataka). Add customer.
2. On the customer page click **New subscription**. Pick template **CRM Starter Bundle**, set the CRM
   quantity to 5. Point at **Each invoice** updating live.
3. **Save as draft → Send quotation → Confirm.** Hover the greyed **Activate now**:
   *"It can't go live before its start date; it activates itself that day."*

## 4. Billing day (1.5 min)

1. **Billing runs**: set **Bill as of** to about 6 weeks ahead, **Run billing now**.
   *"Every due invoice is created, with discounts and GST. Missed periods are caught up."*
2. Click **Run billing now** again: **0 created**. *"Nobody is ever billed twice; the database itself refuses a duplicate."*
3. **Invoices → Overdue only**, open a **Kaveri Foods** invoice:
   - tax lines: a Tamil Nadu customer gets **CGST + SGST**, other states (like Nila Bakers) get **IGST**
   - **UPI QR** with the amount filled in
   - **Reminders sent**: the history of email and WhatsApp reminders
   - **Remind → WhatsApp**: opens with the message written. **Print** shows the GST tax invoice.

## 5. The money comes in (1.5 min) — the "wow" part

1. **Payments → Read a payment → Try a sample → Receipt photo.**
   *"It reads the photo in the browser, finds the amount, UTR and invoice number, and matches the invoice."*
   Click **Record payment**.
2. **Import bank statement → Use a sample statement → Match payments.**
   *"Every credit is matched: sure matches, a part payment to check, an unknown left alone."* Record them.

## 6. The customer's view (1 min) — **customer** window (Kaveri Foods)

1. Balance at the top, overdue highlighted. Subscription cards with the ring.
2. **Pause** the active subscription: *"Paused time is never billed."*
3. **Invoices → PDF**, and **Browse plans → Request this plan** → shows up as a quotation for staff.

## 7. The finance lead at month end (1 min) — back to **admin**

1. **Dashboard**: active subscriptions, MRR and ARR, a year of collected revenue, outstanding, overdue (marigold).
2. **How recurring revenue moved**: new vs paused vs closed this month.
3. **Ending in the next 30 days** with one-click **Renew**. **Export CSV.**
4. **Audit log**: every action you just did, with who and when. Search a record, e.g. `INV-2026`.

## Close (15 s)

> Renewals bill themselves, invoices are GST-ready with a UPI QR, payments match themselves
> from a photo or a bank statement, and the finance lead sees the month on one page.

---

### If something goes wrong

- Numbers look odd after a rehearsal → stop the app, `npm run reset-demo`, `npm run dev`.
- The app says it can't reach the database → check the internet connection (Neon is online), then
  look at the server's terminal: it says exactly what's wrong.
- A page breaks → it shows "This page hit a problem" with **Reload page**; click it. The rest of the app keeps working.
- Photo reading is slow the first time (it loads the reader once); use the **UPI SMS** sample instead.
- No internet at the venue → set `VITE_USE_MOCKS=true` in `client/.env` and run `cd client && npm run dev`.
  Built-in demo data, logins `admin@brightloop.test` / `Demo@12345`.
- Everyone can open **How to use** in the sidebar (or portal header) for the rules in plain English.
