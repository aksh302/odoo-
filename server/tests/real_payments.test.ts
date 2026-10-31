import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../src/lib/prisma';
import { PaymentService } from '../src/modules/payments/service';
import { SubscriptionService } from '../src/modules/subscriptions/service';
import { BillingService } from '../src/modules/billing/service';
import {
  BillingPeriod,
  SubscriptionStatus,
  InvoiceStatus,
  PaymentMethod,
  Role,
} from '@prisma/client';
import bcrypt from 'bcrypt';

describe('Real Database Payment Lifecycle & Concurrency Locks', () => {
  let customerId: number;
  let adminId: number;
  let subId: number;
  let invoiceId: number;

  beforeAll(async () => {
    const hash = await bcrypt.hash('Test@123', 8);

    const admin = await prisma.user.create({
      data: {
        name: 'Admin Tester',
        email: `admin_pay_${Date.now()}@test.com`,
        passwordHash: hash,
        role: Role.ADMIN,
      },
    });
    adminId = admin.id;

    const cust = await prisma.user.create({
      data: {
        name: 'Paying Cust',
        email: `paying_${Date.now()}@test.com`,
        passwordHash: hash,
        role: Role.CUSTOMER,
      },
    });
    customerId = cust.id;

    const plan = await prisma.plan.create({
      data: {
        name: 'Pay Plan',
        price: 50000,
        billingPeriod: BillingPeriod.MONTHLY,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2028-12-31'),
      },
    });

    const sub = await SubscriptionService.createSubscription(customerId, {
      customerId,
      planId: plan.id,
      startDate: new Date('2026-10-01'),
      paymentTerms: 15,
      lines: [],
    });
    subId = sub.id;

    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.QUOTATION);
    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.CONFIRMED);
    await SubscriptionService.transitionStatus(customerId, sub.id, SubscriptionStatus.ACTIVE);

    // Run billing
    await BillingService.runBilling('test', new Date('2026-10-05'));
    const inv = await prisma.invoice.findFirst({
      where: { subscriptionId: sub.id },
    });
    invoiceId = inv!.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects payment exceeding invoice total (row lock check)', async () => {
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(inv).not.toBeNull();

    await expect(
      PaymentService.recordPayment(customerId, {
        invoiceId,
        method: PaymentMethod.UPI,
        amount: inv!.total + 10000,
      }),
    ).rejects.toThrowError(/Payment amount exceeds outstanding balance/);
  });

  it('records partial payment then final payment transitions status to PAID', async () => {
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    const half = Math.floor(inv!.total / 2);
    const rest = inv!.total - half;

    const p1 = await PaymentService.recordPayment(customerId, {
      invoiceId,
      method: PaymentMethod.UPI,
      amount: half,
    });
    expect(p1.amount).toBe(half);

    const invMid = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(invMid?.status).toBe(InvoiceStatus.CONFIRMED);
    expect(invMid?.amountPaid).toBe(half);

    const p2 = await PaymentService.recordPayment(customerId, {
      invoiceId,
      method: PaymentMethod.BANK_TRANSFER,
      amount: rest,
    });
    expect(p2.amount).toBe(rest);

    const invFinal = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(invFinal?.status).toBe(InvoiceStatus.PAID);
    expect(invFinal?.amountPaid).toBe(inv!.total);
  });

  it('admin void rolls back invoice from PAID to CONFIRMED', async () => {
    const payment = await prisma.payment.findFirst({
      where: { invoiceId, voidedAt: null },
      orderBy: { id: 'desc' },
    });
    expect(payment).not.toBeNull();

    const voided = await PaymentService.voidPayment(adminId, payment!.id, 'Refund issued');
    expect(voided.voidedAt).not.toBeNull();

    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    expect(inv?.status).toBe(InvoiceStatus.CONFIRMED);
    expect(inv?.amountPaid).toBeLessThan(inv!.total);
  });
});

