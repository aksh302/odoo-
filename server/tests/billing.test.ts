import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../src/lib/prisma';
import { BillingService } from '../src/modules/billing/service';
import { SubscriptionService } from '../src/modules/subscriptions/service';
import { PricingService } from '../src/modules/pricing/service';
import {
  BillingPeriod,
  SubscriptionStatus,
  InvoiceStatus,
  DiscountType,
  DiscountScope,
  Role,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import { addDays } from '../src/lib/dates';

describe('Real Database Billing Engine (SRS 9.9 T-1 to T-10)', () => {
  let customerId: number;
  let monthlyPlanId: number;
  let productId: number;
  let taxId: number;

  beforeAll(async () => {
    // Truncate test schema tables
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        test."Payment",
        test."InvoiceLine",
        test."Invoice",
        test."SubscriptionLine",
        test."Subscription",
        test."TemplateLine",
        test."QuotationTemplate",
        test."DiscountProduct",
        test."Discount",
        test."Variant",
        test."Product",
        test."Plan",
        test."Tax",
        test."CustomerProfile",
        test."User"
      CASCADE;
    `);

    const hash = await bcrypt.hash('Test@123', 8);

    const user = await prisma.user.create({
      data: {
        name: 'Test Customer',
        email: `test_billing_${Date.now()}@test.com`,
        passwordHash: hash,
        role: Role.CUSTOMER,
      },
    });
    customerId = user.id;

    const tax = await prisma.tax.create({
      data: { name: 'GST 18%', percent: 18.0 },
    });
    taxId = tax.id;

    const plan = await prisma.plan.create({
      data: {
        name: 'Standard Monthly',
        price: 100000, // ₹1,000
        billingPeriod: BillingPeriod.MONTHLY,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2028-12-31'),
      },
    });
    monthlyPlanId = plan.id;

    const product = await prisma.product.create({
      data: {
        name: 'CRM Software',
        type: 'software',
        salesPrice: 200000, // ₹2,000
        costPrice: 50000,
        taxId: tax.id,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('T-1: Double trigger of billing run for same date creates 0 duplicate invoices', async () => {
    // Release any lingering locks first
    try {
      await prisma.$executeRawUnsafe('SELECT pg_advisory_unlock(424242);');
    } catch {}

    // Create active subscription due on 2026-10-01
    const sub = await SubscriptionService.createSubscription(customerId, {
      customerId,
      planId: monthlyPlanId,
      startDate: new Date('2026-10-01'),
      paymentTerms: 15,
      lines: [{ productId, quantity: 1 }],
    });

    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.QUOTATION);
    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.CONFIRMED);
    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.ACTIVE);

    // Run 1 as of 2026-10-05
    const run1 = await BillingService.runBilling('test', new Date('2026-10-05'));
    expect(run1.created).toBeGreaterThanOrEqual(1);

    // Run 2 as of same date
    const run2 = await BillingService.runBilling('test', new Date('2026-10-05'));
    expect(run2.created).toBe(0);
    expect(run2.skipped).toBeGreaterThanOrEqual(0);
  });

  it('T-2: Concurrent billing runs do not create duplicate invoices (Advisory Lock)', async () => {
    const sub = await prisma.subscription.findFirst({
      where: { status: SubscriptionStatus.ACTIVE },
    });
    expect(sub).not.toBeNull();

    const [res1, res2] = await Promise.allSettled([
      BillingService.runBilling('worker-1', new Date('2026-10-05')),
      BillingService.runBilling('worker-2', new Date('2026-10-05')),
    ]);

    // Either both succeed with 0 duplicates, or one gets rejected by advisory lock (409)
    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // Verify exactly 1 invoice exists for sub periodStart 2026-10-01
    const invCount = await prisma.invoice.count({
      where: { subscriptionId: sub!.id, periodStart: new Date('2026-10-01'), isSynthetic: false },
    });
    expect(invCount).toBe(1);
  });

  it('T-3: Catch-up loop generates consecutive invoices after scheduler downtime', async () => {
    // Create subscription that started 3 months ago: 2026-07-01
    const sub = await SubscriptionService.createSubscription(customerId, {
      customerId,
      planId: monthlyPlanId,
      startDate: new Date('2026-07-01'),
      paymentTerms: 15,
      lines: [{ productId, quantity: 1 }],
    });

    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.QUOTATION);
    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.CONFIRMED);
    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.ACTIVE);

    // Run billing as of 2026-10-05 -> Should generate invoices for July, August, September, October (4 periods)
    const run = await BillingService.runBilling('test-catchup', new Date('2026-10-05'));
    expect(run.created).toBeGreaterThanOrEqual(4);

    const invoices = await prisma.invoice.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { periodStart: 'asc' },
    });
    expect(invoices.length).toBe(4);
    expect(invoices[0].periodStart.toISOString().split('T')[0]).toBe('2026-07-01');
    expect(invoices[1].periodStart.toISOString().split('T')[0]).toBe('2026-08-01');
    expect(invoices[2].periodStart.toISOString().split('T')[0]).toBe('2026-09-01');
    expect(invoices[3].periodStart.toISOString().split('T')[0]).toBe('2026-10-01');
  });

  it('T-4: Month-end anchorDay clamping (Jan 31 -> Feb 28 -> Mar 31)', async () => {
    const sub = await SubscriptionService.createSubscription(customerId, {
      customerId,
      planId: monthlyPlanId,
      startDate: new Date('2026-01-31'),
      paymentTerms: 15,
      lines: [{ productId, quantity: 1 }],
    });

    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.QUOTATION);
    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.CONFIRMED);
    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.ACTIVE);

    // Run as of 2026-04-01 -> Should generate Jan 31, Feb 28, Mar 31
    await BillingService.runBilling('test-anchorday', new Date('2026-04-01'));

    const invoices = await prisma.invoice.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { periodStart: 'asc' },
    });

    expect(invoices.length).toBe(3);
    expect(invoices[0].periodStart.toISOString().split('T')[0]).toBe('2026-01-31');
    expect(invoices[1].periodStart.toISOString().split('T')[0]).toBe('2026-02-28');
    expect(invoices[2].periodStart.toISOString().split('T')[0]).toBe('2026-03-31');
  });

  it('T-5: Enforces partial unique index on (subscriptionId, periodStart)', async () => {
    const sub = await prisma.subscription.findFirst({
      where: { status: SubscriptionStatus.ACTIVE },
    });
    expect(sub).not.toBeNull();

    const existingInv = await prisma.invoice.findFirst({
      where: { subscriptionId: sub!.id, status: { not: InvoiceStatus.CANCELLED } },
    });
    expect(existingInv).not.toBeNull();

    // Directly attempting to insert duplicate invoice with same subscriptionId & periodStart should be rejected by PostgreSQL
    const duplicatePromise = prisma.invoice.create({
      data: {
        number: `INV-DUP-${Date.now()}`,
        subscriptionId: sub!.id,
        customerId: sub!.customerId,
        periodStart: existingInv!.periodStart,
        periodEnd: existingInv!.periodEnd,
        dueDate: existingInv!.dueDate,
        subtotal: 100000,
        discountTotal: 0,
        taxTotal: 0,
        total: 100000,
        amountPaid: 0,
        customerSnapshot: {},
      },
    });

    await expect(duplicatePromise).rejects.toThrow();
  });

  it('T-6: Cancelled invoice allows re-billing the period', async () => {
    const sub = await SubscriptionService.createSubscription(customerId, {
      customerId,
      planId: monthlyPlanId,
      startDate: new Date('2026-11-01'),
      paymentTerms: 15,
      lines: [{ productId, quantity: 1 }],
    });

    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.QUOTATION);
    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.CONFIRMED);
    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.ACTIVE);

    // Bill Nov 1
    await BillingService.runBilling('test-cancel', new Date('2026-11-02'));
    const inv = await prisma.invoice.findFirst({
      where: { subscriptionId: sub.id, periodStart: new Date('2026-11-01') },
    });
    expect(inv).not.toBeNull();

    // Cancel invoice
    await BillingService.cancelInvoice(customerId, inv!.id, 'Customer requested change');

    // Reset nextBillingDate back to 2026-11-01 to simulate re-running
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { nextBillingDate: new Date('2026-11-01') },
    });

    // Re-run billing
    const rebillRun = await BillingService.runBilling('test-cancel', new Date('2026-11-02'));
    expect(rebillRun.created).toBe(1);

    const activeInvoices = await prisma.invoice.findMany({
      where: {
        subscriptionId: sub.id,
        periodStart: new Date('2026-11-01'),
        status: { not: InvoiceStatus.CANCELLED },
      },
    });
    expect(activeInvoices.length).toBe(1);
  });

  it('T-7: Atomic discount usage cap prevents exceeding usageLimit', async () => {
    const discount = await prisma.discount.create({
      data: {
        name: 'Flash Sale',
        type: DiscountType.FIXED,
        value: 20000,
        scope: DiscountScope.PRODUCT,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2027-12-31'),
        usageLimit: 1,
        usedCount: 0,
        products: { create: [{ productId }] },
      },
    });

    // Claim 1
    await prisma.$transaction(async (tx) => {
      await PricingService.claimDiscountUsageTx(tx, discount.id);
    });

    // Claim 2 should fail
    await expect(
      prisma.$transaction(async (tx) => {
        await PricingService.claimDiscountUsageTx(tx, discount.id);
      }),
    ).rejects.toThrowError(/Discount usage limit reached/);
  });

  it('T-8: Plan fee isolated on Line 1 with unitPrice = plan.price, quantity = 1, tax = 0', async () => {
    const sub = await SubscriptionService.createSubscription(customerId, {
      customerId,
      planId: monthlyPlanId,
      startDate: new Date('2026-12-01'),
      paymentTerms: 15,
      lines: [{ productId, quantity: 2 }],
    });

    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.QUOTATION);
    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.CONFIRMED);
    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.ACTIVE);

    await BillingService.runBilling('test-planfee', new Date('2026-12-05'));

    const inv = await prisma.invoice.findFirst({
      where: { subscriptionId: sub.id, periodStart: new Date('2026-12-01') },
      include: { lines: true },
    });

    expect(inv).not.toBeNull();
    expect(inv!.lines.length).toBe(2); // Line 1: plan fee, Line 2: CRM Software

    // Line 1 must be the plan fee isolated with quantity=1, unitPrice=plan.price, tax=0, and null productId
    const planFeeLine = inv!.lines[0];
    expect(planFeeLine.productId).toBeNull();
    expect(planFeeLine.description).toContain('Plan fee');
    expect(planFeeLine.quantity).toBe(1);
    expect(planFeeLine.unitPrice).toBe(100000);
    expect(Number(planFeeLine.taxPercent)).toBe(0);
    expect(planFeeLine.taxAmount).toBe(0);
    expect(planFeeLine.amount).toBe(100000);
  });

  it('T-9: Invoice numbering uses sequence INV-YYYY-XXXXXX without gaps', async () => {
    // Generate consecutive invoice numbers
    const num1 = await BillingService.getNextInvoiceNumber();
    const num2 = await BillingService.getNextInvoiceNumber();

    const regex = /^INV-\d{4}-\d{6}$/;
    expect(num1).toMatch(regex);
    expect(num2).toMatch(regex);

    // Extract sequence numbers and ensure no gaps
    const seq1 = parseInt(num1.split('-')[2], 10);
    const seq2 = parseInt(num2.split('-')[2], 10);
    expect(seq2).toBe(seq1 + 1);
  });

  it('T-10: Subscriptions without active due periods are skipped', async () => {
    // Future subscription due in 2029
    const futureSub = await SubscriptionService.createSubscription(customerId, {
      customerId,
      planId: monthlyPlanId,
      startDate: new Date('2029-01-01'),
      paymentTerms: 15,
      lines: [{ productId, quantity: 1 }],
    });

    await SubscriptionService.transitionStatus(customerId, futureSub.id, SubscriptionStatus.QUOTATION);
    await SubscriptionService.transitionStatus(customerId, futureSub.id, SubscriptionStatus.CONFIRMED);
    await SubscriptionService.transitionStatus(customerId, futureSub.id, SubscriptionStatus.ACTIVE);

    // Run billing as of today (2026-10-31)
    const run = await BillingService.runBilling('test-future', new Date('2026-10-31'));

    // The future subscription must NOT have an invoice generated
    const inv = await prisma.invoice.findFirst({
      where: { subscriptionId: futureSub.id },
    });
    expect(inv).toBeNull();
  });
});
