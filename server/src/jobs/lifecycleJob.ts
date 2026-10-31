import prisma from '../lib/prisma';
import { SubscriptionStatus } from '@prisma/client';
import { todayIST } from '../lib/dates';
import { audit } from '../lib/audit';

export async function runLifecycleJob(): Promise<{ activated: number; closed: number }> {
  const today = todayIST();
  let activated = 0;
  let closed = 0;

  // 1. Auto-activate CONFIRMED subscriptions whose startDate <= today
  const dueToActivate = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.CONFIRMED,
      startDate: { lte: today },
    },
  });

  for (const sub of dueToActivate) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        nextBillingDate: sub.nextBillingDate || sub.startDate,
      },
    });

    await audit({
      action: 'LIFECYCLE_AUTO_ACTIVATE',
      entity: 'Subscription',
      entityId: sub.id,
      oldValue: { status: sub.status },
      newValue: { status: SubscriptionStatus.ACTIVE },
    });

    activated++;
  }

  // 2. Auto-close ACTIVE or PAUSED subscriptions whose expiryDate < today
  // or whose plan has autoClose=true and plan.endDate < today
  const activeOrPaused = await prisma.subscription.findMany({
    where: {
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED] },
    },
    include: { plan: true },
  });

  for (const sub of activeOrPaused) {
    const expiredByDate = sub.expiryDate < today;
    const expiredByPlan = sub.plan.autoClose && sub.plan.endDate < today;

    if (expiredByDate || expiredByPlan) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.CLOSED,
          nextBillingDate: null,
        },
      });

      await audit({
        action: 'LIFECYCLE_AUTO_CLOSE',
        entity: 'Subscription',
        entityId: sub.id,
        oldValue: { status: sub.status },
        newValue: { status: SubscriptionStatus.CLOSED, reason: expiredByDate ? 'EXPIRY' : 'PLAN_END' },
      });

      closed++;
    }
  }

  return { activated, closed };
}
