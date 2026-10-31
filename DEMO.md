# Brightloop demo script (about 8 minutes)

Run the frontend with mock data (`VITE_USE_MOCKS=true`) unless the backend is fully ready.
Before you start: open http://localhost:5173, then **account menu → Reset demo data** so every number below is fresh.

| Account | Email | Password |
|---|---|---|
| Admin | admin@brightloop.test | Demo@12345 |
| Staff | staff@brightloop.test | Demo@12345 |
| Customer | customer@brightloop.test | Demo@12345 |

Tip: open the customer in a private/incognito window so you can switch without logging out.

---

## 1. The problem (30 s, no clicks)

> Brightloop sells software on subscription. Today renewals are remembered by whoever notices,
> invoices are typed by hand, and payments are matched by scrolling bank statements.
> We built one system that runs the whole month.

## 2. Admin sets up a plan (1 min) — log in as **admin**

1. **Login page**: point at the ring. *"Every dot is a renewal: mint are billed, marigold are due."*
2. **Products → Brightloop ERP**: show the Odoo variant, **+₹560**, final price worked out.
3. **Plans → New plan**: Monthly, ₹1,999, minimum 5 seats. Switch Pause on, Close early off. Create.
   *"The plan decides what customers are allowed to do later."*

## 3. Staff sells it (1.5 min) — still admin is fine, or log in as **staff**

1. **Customers → New customer**: "Tiru Textiles", any email, GSTIN `29ABCDE1234F1Z5` (Karnataka). Add customer.
2. On the customer page click **New subscription**. Pick template **ERP starter offer**, change ERP quantity.
   Point at **Each invoice** updating live.
3. **Save as draft → Send quotation → Confirm.** Hover the greyed **Activate now**:
   *"It can't go live before its start date; it activates itself that day."*

## 4. Billing day (1.5 min)

1. **Billing runs**: set **Bill as of** to about 6 weeks ahead, **Run billing now**.
   *"Every due invoice is created, with discounts and GST. Missed periods are caught up."*
2. Click **Run billing now** again: **0 created**. *"Nobody is ever billed twice."*
3. **Invoices → Overdue only**, open one:
   - discount line ("Festive ₹500 off"), **CGST/SGST** split, place of supply
   - **UPI QR** with the amount filled in
   - **Remind → WhatsApp**: opens with the message written. **Print** shows the GST tax invoice.

## 5. The money comes in (1.5 min) — the "wow" part

1. **Payments → Read a payment → Try a sample → Receipt photo.**
   *"It reads the photo in the browser, finds the amount, UTR and invoice number, and matches the invoice."*
   Click **Record payment**.
2. **Import bank statement → Use a sample statement → Match payments.**
   *"Every credit is matched: 3 sure, 1 part payment to check, 1 unknown left alone."* Record them.

## 6. The customer's view (1 min) — **customer** window

1. Balance at the top, overdue highlighted. Subscription cards with the ring.
2. **Pause** the active subscription: *"Paused time is never billed."*
3. **Invoices → PDF**, and **Browse plans → Request this plan** → shows up as a quotation for staff.

## 7. The finance lead at month end (1 min) — back to **admin**

1. **Dashboard**: active subscriptions, MRR and ARR, collected, outstanding, overdue (marigold).
2. **How recurring revenue moved**: new vs paused vs closed this month.
3. **Ending in the next 30 days** with one-click **Renew**. **Export CSV.**
4. **Audit log**: every action you just did, with who and when.

## Close (15 s)

> Renewals bill themselves, invoices are GST-ready with a UPI QR, payments match themselves
> from a photo or a bank statement, and the finance lead sees the month on one page.

---

### If something goes wrong

- Numbers look odd → account menu → **Reset demo data**.
- A page breaks → it shows "This page hit a problem" with **Reload page**; click it. The rest of the app keeps working.
- Photo reading is slow the first time (it loads the reader once); use **UPI SMS** sample instead.
- Everyone can open **How to use** in the sidebar (or portal header) for the rules in plain English.
