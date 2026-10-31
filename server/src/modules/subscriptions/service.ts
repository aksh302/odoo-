import { SubscriptionStatus } from '@prisma/client';
import prisma from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { todayIST, addDays } from '../../lib/dates';
import { PaginationParams, paginate } from '../../lib/pagination';

export const ALLOWED_SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  DRAFT: [SubscriptionStatus.QUOTATION, SubscriptionStatus.CANCELLED],
  QUOTATION: [SubscriptionStatus.CONFIRMED, SubscriptionStatus.CANCELLED],
  CONFIRMED: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED],
  ACTIVE: [SubscriptionStatus.PAUSED, SubscriptionStatus.CLOSED],
  PAUSED: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CLOSED],
  CLOSED: [],
  CANCELLED: [],
};

export class SubscriptionService {
  static async generateNumber(): Promise<string> {
    try {
      const res = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('subscription_seq')`;
      const seq = Number(res[0].nextval);
      const year = new Date().getFullYear();
      return `SUB-${year}-${String(seq).padStart(6, '0')}`;
    } catch {
      // Fallback for mock environments
      const count = await prisma.subscription.count();
      const year = new Date().getFullYear();
      return `SUB-${year}-${String(count + 1).padStart(6, '0')}`;
    }
  }

  static async listSubscriptions(
    pagination: PaginationParams,
    filters?: { customerId?: number; status?: SubscriptionStatus },
  ) {
    const where: any = { isSynthetic: false };
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.status) where.status = filters.status;

    const [data, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true } },
          plan: true,
          lines: true,
        },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { id: 'desc' },
      }),
      prisma.subscription.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  static async getSubscription(id: number, customerIdFilter?: number) {
    const sub = await prisma.subscription.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, email: true, profile: true } },
        plan: true,
        lines: true,
        invoices: {
          where: { isSynthetic: false },
          orderBy: { periodStart: 'desc' },
        },
      },
    });

    if (!sub || (customerIdFilter && sub.customerId !== customerIdFilter)) {
      throw Errors.notFound('Subscription', id);
    }
    return sub;
  }

  static async createSubscription(
    actorId: number,
    data: {
      customerId: number;
      planId?: number;
      templateId?: number;
      startDate: Date;
      expiryDate?: Date;
      paymentTerms: number;
      lines: Array<{ productId: number; variantId?: number; quantity: number }>;
    },
  ) {
    let targetPlanId = data.planId;
    const finalLines = [...data.lines];

    // If templateId is provided, populate plan and lines from the template
    if (data.templateId) {
      const template = await prisma.quotationTemplate.findUnique({
        where: { id: data.templateId },
        include: { lines: true },
      });
      if (!template) throw Errors.notFound('QuotationTemplate', data.templateId);
      targetPlanId = template.planId;

      if (finalLines.length === 0) {
        for (const tl of template.lines) {
          finalLines.push({
            productId: tl.productId,
            variantId: tl.variantId || undefined,
            quantity: tl.quantity,
          });
        }
      }
    }

    if (!targetPlanId) {
      throw Errors.validationError({ planId: 'planId or templateId is required' });
    }

    const plan = await prisma.plan.findUnique({ where: { id: targetPlanId } });
    if (!plan || plan.isArchived) throw Errors.planArchived();

    const customer = await prisma.user.findUnique({ where: { id: data.customerId } });
    if (!customer || !customer.isActive) throw Errors.notFound('Customer', data.customerId);

    // Snapshot lines
    const lineCreations = [];
    for (const item of finalLines) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: { tax: true },
      });
      if (!product || product.isArchived) throw Errors.productArchived();

      let extraPrice = 0;
      let description = product.name;

      if (item.variantId) {
        const variant = await prisma.variant.findUnique({ where: { id: item.variantId } });
        if (variant && !variant.isArchived) {
          extraPrice = variant.extraPrice;
          description = `${product.name} - ${variant.value}`;
        }
      }

      const unitPrice = product.salesPrice + extraPrice;
      const amount = unitPrice * item.quantity;

      lineCreations.push({
        productId: product.id,
        variantId: item.variantId,
        description,
        quantity: item.quantity,
        unitPrice,
        taxId: product.taxId,
        amount,
      });
    }

    const number = await this.generateNumber();
    const anchorDay = data.startDate.getUTCDate();
    const expiry = data.expiryDate || addDays(data.startDate, 365);
    const quotationDate = todayIST();
    const validUntil = addDays(quotationDate, 30);

    const subscription = await prisma.subscription.create({
      data: {
        number,
        customerId: data.customerId,
        planId: targetPlanId,
        status: SubscriptionStatus.DRAFT,
        quotationDate,
        validUntil,
        startDate: data.startDate,
        expiryDate: expiry,
        paymentTerms: data.paymentTerms,
        anchorDay,
        nextBillingDate: null,
        lines: { create: lineCreations },
      },
      include: { lines: true, plan: true },
    });

    await audit({
      userId: actorId,
      action: 'SUBSCRIPTION_CREATE',
      entity: 'Subscription',
      entityId: subscription.id,
      newValue: { number: subscription.number, status: subscription.status },
    });

    return subscription;
  }

  static async transitionStatus(
    actorId: number,
    subscriptionId: number,
    targetStatus: SubscriptionStatus,
    customerIdFilter?: number,
  ) {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!sub || (customerIdFilter && sub.customerId !== customerIdFilter)) {
      throw Errors.notFound('Subscription', subscriptionId);
    }

    const allowed = ALLOWED_SUBSCRIPTION_TRANSITIONS[sub.status];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw Errors.invalidTransition(sub.status, targetStatus);
    }

    // Plan capability guards per SRS
    if (targetStatus === SubscriptionStatus.PAUSED && !sub.plan.pausable) {
      throw Errors.conflict('Plan does not allow pausing');
    }
    if (targetStatus === SubscriptionStatus.CLOSED && !sub.plan.closable) {
      throw Errors.conflict('Plan does not allow closing');
    }

    const updateData: any = { status: targetStatus };

    // When transitioning to ACTIVE: set nextBillingDate to startDate if not already set
    if (targetStatus === SubscriptionStatus.ACTIVE) {
      if (!sub.nextBillingDate) {
        updateData.nextBillingDate = sub.startDate;
      }
    }

    // When PAUSED or CLOSED: nextBillingDate cleared or left inactive
    if (targetStatus === SubscriptionStatus.CLOSED || targetStatus === SubscriptionStatus.CANCELLED) {
      updateData.nextBillingDate = null;
    }

    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: updateData,
    });

    await audit({
      userId: actorId,
      action: 'SUBSCRIPTION_STATUS',
      entity: 'Subscription',
      entityId: subscriptionId,
      oldValue: { status: sub.status },
      newValue: { status: targetStatus },
    });

    return updated;
  }

  static async renewSubscription(actorId: number, subscriptionId: number, customerIdFilter?: number) {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!sub || (customerIdFilter && sub.customerId !== customerIdFilter)) {
      throw Errors.notFound('Subscription', subscriptionId);
    }

    if (!sub.plan.renewable) {
      throw Errors.conflict('Plan is not renewable');
    }

    if (sub.status !== SubscriptionStatus.ACTIVE && sub.status !== SubscriptionStatus.PAUSED) {
      throw Errors.conflict('Can only renew Active or Paused subscriptions');
    }

    // Extend expiry by 1 year (or period duration)
    const newExpiry = addDays(sub.expiryDate, 365);
    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { expiryDate: newExpiry },
    });

    await audit({
      userId: actorId,
      action: 'SUBSCRIPTION_RENEW',
      entity: 'Subscription',
      entityId: subscriptionId,
      oldValue: { expiryDate: sub.expiryDate },
      newValue: { expiryDate: newExpiry },
    });

    return updated;
  }
}

