import { describe, it, expect, vi } from 'vitest';
import { ALLOWED_SUBSCRIPTION_TRANSITIONS, SubscriptionService } from '../src/modules/subscriptions/service';
import { SubscriptionStatus } from '@prisma/client';
import prisma from '../src/lib/prisma';

vi.mock('../src/lib/prisma', () => {
  return {
    default: {
      subscription: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    },
  };
});

describe('Subscription State Machine (SRS 2.2 / Phase 4)', () => {
  it('enforces allowed transitions from DRAFT', () => {
    expect(ALLOWED_SUBSCRIPTION_TRANSITIONS.DRAFT).toEqual([
      SubscriptionStatus.QUOTATION,
      SubscriptionStatus.CANCELLED,
    ]);
  });

  it('enforces allowed transitions from ACTIVE', () => {
    expect(ALLOWED_SUBSCRIPTION_TRANSITIONS.ACTIVE).toEqual([
      SubscriptionStatus.PAUSED,
      SubscriptionStatus.CLOSED,
    ]);
  });

  it('rejects terminal state transitions', () => {
    expect(ALLOWED_SUBSCRIPTION_TRANSITIONS.CLOSED).toEqual([]);
    expect(ALLOWED_SUBSCRIPTION_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('throws INVALID_TRANSITION when attempting illegal jump (e.g. DRAFT -> ACTIVE)', async () => {
    (prisma.subscription.findUnique as any).mockResolvedValue({
      id: 1,
      status: SubscriptionStatus.DRAFT,
      plan: { closable: true, pausable: true },
    });

    await expect(
      SubscriptionService.transitionStatus(1, 1, SubscriptionStatus.ACTIVE),
    ).rejects.toThrowError(/Cannot transition from DRAFT to ACTIVE/);
  });

  it('guards pause against plan.pausable=false', async () => {
    (prisma.subscription.findUnique as any).mockResolvedValue({
      id: 2,
      status: SubscriptionStatus.ACTIVE,
      plan: { pausable: false, closable: true },
    });

    await expect(
      SubscriptionService.transitionStatus(1, 2, SubscriptionStatus.PAUSED),
    ).rejects.toThrowError(/Plan does not allow pausing/);
  });
});

