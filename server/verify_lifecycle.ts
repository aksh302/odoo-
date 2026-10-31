import prisma from './src/lib/prisma';
import { runLifecycleJob } from './src/jobs/lifecycleJob';
import { SubscriptionService } from './src/modules/subscriptions/service';
import { SubscriptionStatus, BillingPeriod } from '@prisma/client';
import { todayIST, addDays } from './src/lib/dates';

async function main() {
  console.log('--- 8. LIFECYCLE JOB RUN TWICE ---');
  const today = todayIST();

  // Create a plan
  const plan = await prisma.plan.create({
    data: {
      name: `Lifecycle Plan ${Date.now()}`,
      price: 10000,
      billingPeriod: BillingPeriod.MONTHLY,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2028-12-31'),
    },
  });

  const cust = await prisma.user.findFirst({ where: { role: 'CUSTOMER' } });
  if (!cust) throw new Error('No customer found');

  // Subscription 1: CONFIRMED with startDate = today (should auto-activate)
  const sub1 = await SubscriptionService.createSubscription(cust.id, {
    customerId: cust.id,
    planId: plan.id,
    startDate: today,
    paymentTerms: 15,
    lines: [],
  });
  await SubscriptionService.transitionStatus(cust.id, sub1.id, SubscriptionStatus.QUOTATION);
  await SubscriptionService.transitionStatus(cust.id, sub1.id, SubscriptionStatus.CONFIRMED);

  // Subscription 2: ACTIVE with expiryDate passed (yesterday) (should auto-close)
  const yesterday = addDays(today, -1);
  const sub2 = await prisma.subscription.create({
    data: {
      number: `SUB-EXP-${Date.now()}`,
      customerId: cust.id,
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      quotationDate: addDays(yesterday, -30),
      validUntil: yesterday,
      startDate: addDays(yesterday, -10),
      expiryDate: yesterday,
      paymentTerms: 15,
    },
  });

  console.log('Sub1 initial status (should be CONFIRMED):', (await prisma.subscription.findUnique({ where: { id: sub1.id } }))?.status);
  console.log('Sub2 initial status (should be ACTIVE):', (await prisma.subscription.findUnique({ where: { id: sub2.id } }))?.status);

  // Run 1
  console.log('\nRunning Lifecycle Job Run 1...');
  const run1 = await runLifecycleJob();
  console.log('Run 1 result:', JSON.stringify(run1));

  const sub1After1 = await prisma.subscription.findUnique({ where: { id: sub1.id } });
  const sub2After1 = await prisma.subscription.findUnique({ where: { id: sub2.id } });
  console.log('Sub1 status after Run 1 (expect ACTIVE):', sub1After1?.status);
  console.log('Sub2 status after Run 1 (expect CLOSED):', sub2After1?.status);

  // Run 2
  console.log('\nRunning Lifecycle Job Run 2 (idempotent, changes nothing)...');
  const run2 = await runLifecycleJob();
  console.log('Run 2 result (expect 0 activated, 0 closed):', JSON.stringify(run2));
  console.log('>> Second run changes nothing:', run2.activated === 0 && run2.closed === 0);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

