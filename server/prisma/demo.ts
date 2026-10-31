/**
 * Demo history: a year of realistic activity so the dashboard, aging, invoices and payments
 * screens have something to show. Run with `npm run seed -- --demo` (or `npm run db:reset`).
 *
 * Invoices are produced by the real billing engine, month by month, and payments go through
 * the real payment service, so every amount, tax, discount and status follows the same rules
 * as the live app. Everything is relative to today, and the random choices use a fixed seed,
 * so the demo looks the same every time it is rebuilt.
 */

import { PrismaClient, Role, SubscriptionStatus, InvoiceStatus, PaymentMethod } from '@prisma/client';

type Core = {
  admin: { id: number };
  staff1: { id: number };
  staff2: { id: number };
  customers: Array<{ id: number }>;
  products: Array<{ id: number; name: string }>;
  variants: Array<{ id: number }>;
  plans: Array<{ id: number; name: string }>;
};

// ---- small helpers ----

/** Deterministic random numbers (mulberry32) so the demo is identical on every machine. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261031);
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const minDate = (a: Date, b: Date) => (a < b ? a : b);
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** A time during office hours in India on that date (10:00 to 18:00 IST). */
const officeHours = (d: Date) => new Date(d.getTime() + (4.5 * 60 + between(0, 479)) * 60000);

/** How each customer pays. */
type Habit = 'early' | 'onTime' | 'late' | 'slipping';

const NEW_CUSTOMERS = [
  { name: 'Meena Iyer', email: 'accounts@tirutextiles.in', company: 'Tiru Textiles', phone: '+91-9443012345', address: '14 Town Hall Road, Tirunelveli 627001', taxId: '33AAFCT4521K1Z8' },
  { name: 'Arjun Rao', email: 'finance@kaverifoods.in', company: 'Kaveri Foods', phone: '+91-9845098450', address: '7 Mysore Road, Bengaluru 560026', taxId: '29AAKCK7788P1Z2' },
  { name: 'Sneha Patil', email: 'billing@sahyadrilogistics.in', company: 'Sahyadri Logistics', phone: '+91-9822033221', address: '210 Hadapsar Industrial Estate, Pune 411013', taxId: '27AASCS3344L1Z6' },
  { name: 'Dr. Farhan Ali', email: 'admin@lotusclinics.in', company: 'Lotus Clinics', phone: '+91-9000412345', address: '3 Banjara Hills, Hyderabad 500034', taxId: '36AAGCL9081M1Z4' },
  { name: 'Vikram Mehta', email: 'ap@indusmotors.in', company: 'Indus Motors', phone: '+91-9824011122', address: 'Plot 22, GIDC Sanand, Ahmedabad 382110', taxId: '24AAECI5566R1Z9' },
  { name: 'Anita George', email: 'office@coastalcraft.in', company: 'Coastal Craft Exports', phone: '+91-9447055667', address: 'Willingdon Island, Kochi 682003', taxId: '32AAJCC2211Q1Z1' },
];

export async function seedDemoHistory(prisma: PrismaClient, core: Core, hash: string) {
  console.log('🎬 Seeding demo history (12 months)...');

  // The billing engine only honours an asOf date in demo mode.
  process.env.DEMO_MODE = 'true';
  const { BillingService } = await import('../src/modules/billing/service');
  const { PaymentService } = await import('../src/modules/payments/service');
  const { SubscriptionService } = await import('../src/modules/subscriptions/service');
  const { todayIST } = await import('../src/lib/dates');

  const today = todayIST();
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();

  // ---- customers ----
  const customers = [...core.customers];
  for (const c of NEW_CUSTOMERS) {
    const user = await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: {
        name: c.name,
        email: c.email,
        passwordHash: hash,
        role: Role.CUSTOMER,
        profile: { create: { company: c.company, phone: c.phone, billingAddress: c.address, taxId: c.taxId } },
      },
    });
    customers.push(user);
  }
  // GSTINs for the five base customers too (their state codes match their cities)
  const baseTaxIds = ['29AABCA1234F1Z5', '07AABCT5678G1Z3', '33AABCG9012H1Z1', '27AABCC3456J1Z7', '19AABCD7890K1Z2'];
  for (let i = 0; i < core.customers.length && i < baseTaxIds.length; i++) {
    await prisma.customerProfile.updateMany({ where: { userId: core.customers[i].id, taxId: null }, data: { taxId: baseTaxIds[i] } });
  }

  // ---- the two core subscriptions start billing from their start date ----
  await prisma.$executeRaw`UPDATE "Subscription" SET "nextBillingDate" = "startDate" WHERE status = 'ACTIVE' AND "isSynthetic" = false`;

  // ---- subscriptions ----
  const [starterM, proM, entM, starterY, proY, , weekly] = core.plans;
  const [crm, erp, email, storage, support, api, analytics, domain] = core.products;
  const v = core.variants; // 0-2 CRM Standard/Professional/Enterprise, 3-5 ERP 5/25/Unlimited

  type Plan = {
    customer: number;
    plan: { id: number };
    monthsAgo: number;
    dayOfMonth: number;
    lines: Array<{ productId: number; variantId?: number; quantity: number }>;
    habit: Habit;
    /** contract length; default 24 months */
    termMonths?: number;
    /** closed this many months ago (0 = this month) */
    closedMonthsAgo?: number;
    pausedThisMonth?: boolean;
  };
  const plans: Plan[] = [
    { customer: 2, plan: proM, monthsAgo: 11, dayOfMonth: 5, habit: 'onTime', termMonths: 12, lines: [{ productId: crm.id, variantId: v[1].id, quantity: 3 }, { productId: storage.id, quantity: 2 }] },
    { customer: 3, plan: starterM, monthsAgo: 10, dayOfMonth: 12, habit: 'early', lines: [{ productId: crm.id, variantId: v[0].id, quantity: 1 }, { productId: domain.id, quantity: 1 }] },
    { customer: 4, plan: entM, monthsAgo: 9, dayOfMonth: 1, habit: 'late', termMonths: 11, lines: [{ productId: erp.id, variantId: v[4].id, quantity: 1 }, { productId: support.id, quantity: 1 }, { productId: api.id, quantity: 2 }] },
    { customer: 5, plan: proM, monthsAgo: 8, dayOfMonth: 20, habit: 'onTime', lines: [{ productId: crm.id, variantId: v[1].id, quantity: 2 }, { productId: email.id, quantity: 1 }] },
    { customer: 6, plan: starterM, monthsAgo: 7, dayOfMonth: 8, habit: 'slipping', lines: [{ productId: crm.id, variantId: v[0].id, quantity: 5 }] },
    { customer: 7, plan: proY, monthsAgo: 6, dayOfMonth: 15, habit: 'early', lines: [{ productId: erp.id, variantId: v[3].id, quantity: 1 }, { productId: analytics.id, quantity: 1 }] },
    { customer: 8, plan: entM, monthsAgo: 6, dayOfMonth: 25, habit: 'onTime', lines: [{ productId: erp.id, variantId: v[5].id, quantity: 1 }, { productId: support.id, quantity: 1 }] },
    { customer: 9, plan: proM, monthsAgo: 5, dayOfMonth: 3, habit: 'late', lines: [{ productId: crm.id, variantId: v[2].id, quantity: 1 }, { productId: email.id, quantity: 1 }] },
    { customer: 10, plan: starterM, monthsAgo: 4, dayOfMonth: 18, habit: 'slipping', lines: [{ productId: crm.id, variantId: v[0].id, quantity: 1 }, { productId: storage.id, quantity: 1 }] },
    { customer: 2, plan: weekly, monthsAgo: 2, dayOfMonth: 7, habit: 'onTime', lines: [] },
    { customer: 3, plan: starterY, monthsAgo: 3, dayOfMonth: 10, habit: 'early', lines: [{ productId: analytics.id, quantity: 1 }] },
    { customer: 4, plan: starterM, monthsAgo: 0, dayOfMonth: 2, habit: 'onTime', lines: [{ productId: api.id, quantity: 1 }] },
    { customer: 10, plan: proM, monthsAgo: 0, dayOfMonth: 6, habit: 'onTime', lines: [{ productId: crm.id, variantId: v[1].id, quantity: 1 }] },
    // Churn: one closed a few months ago, one closed and one paused this month
    { customer: 5, plan: starterM, monthsAgo: 9, dayOfMonth: 14, habit: 'onTime', closedMonthsAgo: 4, lines: [{ productId: email.id, quantity: 1 }] },
    { customer: 9, plan: starterM, monthsAgo: 6, dayOfMonth: 9, habit: 'late', closedMonthsAgo: 0, lines: [{ productId: storage.id, quantity: 3 }] },
    { customer: 7, plan: proM, monthsAgo: 5, dayOfMonth: 11, habit: 'onTime', pausedThisMonth: true, lines: [{ productId: crm.id, variantId: v[1].id, quantity: 1 }] },
  ];

  const habitOf = new Map<number, Habit>();
  const created: Array<{ id: number; spec: Plan }> = [];
  for (const spec of plans) {
    const customer = customers[spec.customer];
    if (!customer) continue;
    const start = day(y, m - spec.monthsAgo, spec.dayOfMonth);
    if (start > today) continue;
    const lines = await SubscriptionService.snapshotLines(spec.lines);
    const sub = await prisma.subscription.create({
      data: {
        number: await SubscriptionService.generateNumber(),
        customerId: customer.id,
        planId: spec.plan.id,
        status: SubscriptionStatus.ACTIVE,
        quotationDate: addDays(start, -14),
        validUntil: addDays(start, 16),
        startDate: start,
        expiryDate: addDays(day(y, m - spec.monthsAgo + (spec.termMonths ?? 24), spec.dayOfMonth), -1),
        paymentTerms: 15,
        anchorDay: spec.dayOfMonth,
        nextBillingDate: start,
        createdAt: addDays(start, -14),
        lines: { create: lines },
      },
    });
    created.push({ id: sub.id, spec });
    habitOf.set(customer.id, spec.habit);
  }
  for (const c of core.customers) if (!habitOf.has(c.id)) habitOf.set(c.id, 'onTime');

  // ---- bill month by month, closing subscriptions at the right moment ----
  for (let back = 12; back >= 0; back--) {
    const monthEnd = minDate(day(y, m - back + 1, 0), today);
    for (const c of created) {
      if (c.spec.closedMonthsAgo !== undefined && c.spec.closedMonthsAgo === back && back > 0) {
        await prisma.subscription.update({ where: { id: c.id }, data: { status: SubscriptionStatus.CLOSED, nextBillingDate: null } });
        await prisma.auditLog.create({
          data: { userId: core.staff1.id, action: 'SUBSCRIPTION_STATUS', entity: 'Subscription', entityId: c.id, oldValue: { status: 'ACTIVE' }, newValue: { status: 'CLOSED' }, at: officeHours(addDays(monthEnd, -3)) },
        });
      }
    }
    (global as any).__billingRunActive = false;
    await BillingService.runBilling('cron', monthEnd);
  }

  // Changes made this month go through the normal service, so they count in "MRR movement"
  for (const c of created) {
    if (c.spec.closedMonthsAgo === 0) await SubscriptionService.transitionStatus(core.staff2.id, c.id, SubscriptionStatus.CLOSED);
    if (c.spec.pausedThisMonth) await SubscriptionService.transitionStatus(core.staff1.id, c.id, SubscriptionStatus.PAUSED);
  }

  // Invoices were created just now; date them as issued on their period start (10:00 IST)
  await prisma.$executeRaw`UPDATE "Invoice" SET "createdAt" = "periodStart" + interval '4 hours 30 minutes' WHERE "isSynthetic" = false`;

  // ---- payments ----
  const invoices = await prisma.invoice.findMany({
    where: { isSynthetic: false, status: InvoiceStatus.CONFIRMED },
    orderBy: [{ customerId: 'asc' }, { periodStart: 'asc' }],
  });
  const lastPerCustomer = new Map<number, number[]>();
  for (const inv of invoices) {
    const list = lastPerCustomer.get(inv.customerId) ?? [];
    list.push(inv.id);
    lastPerCustomer.set(inv.customerId, list);
  }

  const methods: PaymentMethod[] = [PaymentMethod.UPI, PaymentMethod.UPI, PaymentMethod.BANK_TRANSFER, PaymentMethod.BANK_TRANSFER, PaymentMethod.CARD, PaymentMethod.CHEQUE];
  const reference = (method: PaymentMethod) =>
    method === PaymentMethod.UPI ? `UPI${between(100000000, 999999999)}${between(100, 999)}`
      : method === PaymentMethod.BANK_TRANSFER ? `NEFT/HDFCN${between(10000000, 99999999)}`
      : method === PaymentMethod.CHEQUE ? `CHQ ${between(100000, 999999)}`
      : `CARD ****${between(1000, 9999)}`;

  let paid = 0;
  let partial = 0;
  for (const inv of invoices) {
    const habit = habitOf.get(inv.customerId) ?? 'onTime';
    const recent = lastPerCustomer.get(inv.customerId) ?? [];
    const rank = recent.length - recent.indexOf(inv.id); // 1 = newest invoice for this customer

    // When does this customer pay this invoice (if at all)?
    let payOn: Date | null;
    if (habit === 'early') payOn = addDays(inv.periodStart, between(1, 6));
    else if (habit === 'onTime') payOn = addDays(inv.dueDate, -between(0, 5));
    else if (habit === 'late') payOn = rank <= 1 ? null : addDays(inv.dueDate, between(6, 28));
    else payOn = rank <= 3 ? null : addDays(inv.dueDate, between(0, 12)); // slipping: last three unpaid

    if (!payOn || payOn > today) continue;
    const method = pick(methods);
    const actor = pick([core.staff1.id, core.staff2.id, core.admin.id]);

    // Now and then a customer pays in two parts
    if (rand() < 0.12 && inv.total > 200000) {
      const first = Math.round(inv.total * 0.6);
      await PaymentService.recordPayment(actor, { invoiceId: inv.id, method, amount: first, date: payOn, reference: reference(method), note: 'Part payment' });
      const second = addDays(payOn, between(5, 15));
      if (second <= today) {
        await PaymentService.recordPayment(actor, { invoiceId: inv.id, method, amount: inv.total - first, date: second, reference: reference(method) });
        paid++;
      } else partial++;
      continue;
    }
    await PaymentService.recordPayment(actor, { invoiceId: inv.id, method, amount: inv.total, date: payOn, reference: reference(method) });
    paid++;
  }

  // One bounced cheque, voided by the admin and paid again by UPI
  const chequeVictim = await prisma.payment.findFirst({
    where: { method: PaymentMethod.CHEQUE, voidedAt: null, isSynthetic: false, invoice: { status: InvoiceStatus.PAID } },
    orderBy: { date: 'desc' },
  });
  if (chequeVictim) {
    await PaymentService.voidPayment(core.admin.id, chequeVictim.id, 'Cheque bounced (insufficient funds)');
    const again = minDate(addDays(chequeVictim.date, 6), today);
    await PaymentService.recordPayment(core.staff1.id, { invoiceId: chequeVictim.invoiceId, method: PaymentMethod.UPI, amount: chequeVictim.amount, date: again, reference: reference(PaymentMethod.UPI), note: 'Replaces bounced cheque' });
  }

  // ---- reminders on overdue invoices (logged like the app does) ----
  const overdue = (
    await prisma.invoice.findMany({ where: { isSynthetic: false, status: InvoiceStatus.CONFIRMED, dueDate: { lt: today } } })
  ).filter((i) => i.amountPaid < i.total);
  for (const inv of overdue) {
    const reminders = Math.min(3, Math.floor((today.getTime() - inv.dueDate.getTime()) / (86400000 * 10)) + 1);
    for (let r = 0; r < reminders; r++) {
      await prisma.auditLog.create({
        data: {
          userId: pick([core.staff1.id, core.staff2.id]),
          action: 'INVOICE_REMIND',
          entity: 'Invoice',
          entityId: inv.id,
          newValue: { channel: r % 2 === 0 ? 'EMAIL' : 'WHATSAPP', delivered: true },
          at: minDate(officeHours(addDays(inv.dueDate, 2 + r * 10)), new Date()),
        },
      });
    }
  }

  // ---- a sales pipeline: a draft, two quotations and one about to start ----
  const pipeline = [
    { customer: 10, plan: proM, status: SubscriptionStatus.DRAFT, startIn: 10, lines: [{ productId: crm.id, variantId: v[1].id, quantity: 4 }] },
    { customer: 6, plan: entM, status: SubscriptionStatus.QUOTATION, startIn: 7, lines: [{ productId: erp.id, variantId: v[4].id, quantity: 1 }, { productId: support.id, quantity: 1 }] },
    { customer: 1, plan: proM, status: SubscriptionStatus.QUOTATION, startIn: 14, lines: [{ productId: crm.id, variantId: v[2].id, quantity: 2 }, { productId: email.id, quantity: 1 }] },
    { customer: 8, plan: starterM, status: SubscriptionStatus.CONFIRMED, startIn: 5, lines: [{ productId: domain.id, quantity: 2 }] },
  ];
  for (const p of pipeline) {
    const customer = customers[p.customer];
    if (!customer) continue;
    const sub = await SubscriptionService.createSubscription(core.staff1.id, {
      customerId: customer.id,
      planId: p.plan.id,
      startDate: addDays(today, p.startIn),
      paymentTerms: 15,
      lines: p.lines,
    });
    if (p.status !== SubscriptionStatus.DRAFT) await SubscriptionService.transitionStatus(core.staff1.id, sub.id, SubscriptionStatus.QUOTATION);
    if (p.status === SubscriptionStatus.CONFIRMED) await SubscriptionService.transitionStatus(core.staff1.id, sub.id, SubscriptionStatus.CONFIRMED);
  }

  // ---- two fresh drafts so "Confirm all drafts" has something to do ----
  const newest = await prisma.invoice.findMany({
    where: { isSynthetic: false, status: InvoiceStatus.CONFIRMED, amountPaid: 0, periodStart: { gte: day(y, m, 1) } },
    orderBy: { id: 'desc' },
    take: 2,
  });
  for (const inv of newest) await prisma.invoice.update({ where: { id: inv.id }, data: { status: InvoiceStatus.DRAFT } });

  const counts = {
    subscriptions: await prisma.subscription.count({ where: { isSynthetic: false } }),
    invoices: await prisma.invoice.count({ where: { isSynthetic: false } }),
    payments: await prisma.payment.count({ where: { isSynthetic: false } }),
    overdue: overdue.length,
  };
  console.log(
    `✅ Demo history complete: ${customers.length} customers, ${counts.subscriptions} subscriptions, ` +
      `${counts.invoices} invoices, ${counts.payments} payments (${paid} paid, ${partial} part-paid), ${counts.overdue} overdue. Today is ${iso(today)}.`,
  );
}
