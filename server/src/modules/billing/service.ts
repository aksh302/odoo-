import prisma from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { todayIST, periodEnd, dueDate, nextPeriodStart, isOnOrBefore } from '../../lib/dates';
import { PricingService } from '../pricing/service';
import { config } from '../../config';
import { SubscriptionStatus, InvoiceStatus } from '@prisma/client';

export interface BillingRunSummary {
  runId: number;
  asOf: Date;
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{ subscriptionId: number; error: string }>;
}

export class BillingService {
  static async getNextInvoiceNumber(): Promise<string> {
    try {
      const res = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('invoice_seq')`;
      const seq = Number(res[0].nextval);
      const year = new Date().getFullYear();
      return `INV-${year}-${String(seq).padStart(6, '0')}`;
    } catch {
      const count = await prisma.invoice.count();
      const year = new Date().getFullYear();
      return `INV-${year}-${String(count + 1).padStart(6, '0')}`;
    }
  }

  static async isAutoConfirmEnabled(): Promise<boolean> {
    const setting = await prisma.setting.findUnique({ where: { key: 'auto_confirm_invoices' } });
    return setting?.value !== 'false';
  }

  /**
   * Run the billing engine.
   * Mandates:
   * - Postgres advisory lock
   * - One transaction per subscription
   * - Catch-up loop (handles multiple periods overdue)
   * - Partial unique index guard
   * - BillingRun record
   */
  static async runBilling(triggeredBy: string, asOfParam?: Date): Promise<BillingRunSummary> {
    const asOf = asOfParam || todayIST();

    // In non-demo mode, asOf cannot be overridden
    const effectiveAsOf = config.demoMode && asOfParam ? asOfParam : todayIST();

    // In-process lock to prevent overlapping runs within the same instance
    if ((global as any).__billingRunActive) {
      const lockStartTime = (global as any).__billingRunStartTime || 0;
      if (Date.now() - lockStartTime > 30000) {
        // Clear stale in-process lock
        (global as any).__billingRunActive = false;
      } else {
        throw Errors.billingLocked();
      }
    }
    (global as any).__billingRunActive = true;
    (global as any).__billingRunStartTime = Date.now();

    // Acquire PostgreSQL Advisory Lock (lock id: 424242)
    let lockAcquired = true;
    try {
      const lockRes = await prisma.$queryRaw<{ pg_try_advisory_lock: boolean }[]>`
        SELECT pg_try_advisory_lock(424242) as pg_try_advisory_lock
      `;
      lockAcquired = lockRes[0]?.pg_try_advisory_lock ?? true;
    } catch {
      // In SQLite / mock fallback
      lockAcquired = true;
    }

    if (!lockAcquired) {
      (global as any).__billingRunActive = false;
      throw Errors.billingLocked();
    }

    // Start BillingRun record
    const run = await prisma.billingRun.create({
      data: {
        triggeredBy,
        asOf: effectiveAsOf,
        created: 0,
        skipped: 0,
        failed: 0,
      },
    });

    let createdCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errorDetails: Array<{ subscriptionId: number; error: string }> = [];

    try {
      // Find all Active subscriptions with nextBillingDate <= asOf
      const dueSubscriptions = await prisma.subscription.findMany({
        where: {
          status: SubscriptionStatus.ACTIVE,
          nextBillingDate: { lte: effectiveAsOf },
          isSynthetic: false,
        },
        include: {
          plan: true,
          lines: {
            include: { tax: true },
          },
          customer: {
            include: { profile: true },
          },
        },
        orderBy: { id: 'asc' },
      });

      const autoConfirm = await this.isAutoConfirmEnabled();

      // Pre-fetch active discounts once for entire run (eliminates 1,000+ redundant roundtrips)
      const allDiscounts = await prisma.discount.findMany({
        where: {
          isActive: true,
          startDate: { lte: effectiveAsOf },
          endDate: { gte: effectiveAsOf },
        },
        include: { products: true },
      });
      const activeDiscounts = allDiscounts.filter(
        (d) => d.usageLimit === null || d.usedCount < d.usageLimit,
      );

      // Pre-allocate invoice sequence block in a single query
      let baseInvSeq = 1;
      try {
        const seqRes = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('invoice_seq')`;
        baseInvSeq = Number(seqRes[0].nextval);
        await prisma.$executeRawUnsafe(`SELECT setval('invoice_seq', ${baseInvSeq + dueSubscriptions.length * 2 + 50})`);
      } catch {
        baseInvSeq = (await prisma.invoice.count()) + 1;
      }
      const invYear = new Date().getFullYear();
      let nextSeqCounter = baseInvSeq;
      const getNextInvNum = () => `INV-${invYear}-${String(nextSeqCounter++).padStart(6, '0')}`;

      // Process subscriptions in concurrent pools (one isolated transaction per subscription)
      const concurrency = 8;
      for (let i = 0; i < dueSubscriptions.length; i += concurrency) {
        const chunk = dueSubscriptions.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (sub) => {
            try {
              // One transaction per subscription
              await prisma.$transaction(
                async (tx) => {
                  if (sub.status !== SubscriptionStatus.ACTIVE || !sub.nextBillingDate) {
                    skippedCount++;
                    return;
                  }

                  // Catch-up loop: generate invoices until nextBillingDate > effectiveAsOf or sub is expired
                  let curBillingDate = new Date(sub.nextBillingDate);
                  const anchorDay = sub.anchorDay || curBillingDate.getUTCDate();

                while (isOnOrBefore(curBillingDate, effectiveAsOf) && isOnOrBefore(curBillingDate, currentSub.expiryDate)) {
                  const pStart = curBillingDate;
                  const pEnd = periodEnd(pStart, sub.plan.billingPeriod, anchorDay);
                  const pDue = dueDate(pStart, sub.paymentTerms);

                  // Check if already billed for this period (defense in depth)
                  const existingInv = await tx.invoice.findFirst({
                    where: {
                      subscriptionId: sub.id,
                      periodStart: pStart,
                      status: { not: InvoiceStatus.CANCELLED },
                      isSynthetic: false,
                    },
                  });

                  if (existingInv) {
                    // Advance date and continue
                    curBillingDate = nextPeriodStart(curBillingDate, sub.plan.billingPeriod, anchorDay);
                    continue;
                  }

                  // Evaluate pricing with prefetched discounts
                  const pricing = await PricingService.computePricing(
                    sub.plan,
                    sub.lines.map((l) => ({
                      productId: l.productId,
                      variantId: l.variantId,
                      description: l.description,
                      quantity: l.quantity,
                      unitPrice: l.unitPrice,
                      taxPercent: l.tax ? Number(l.tax.percent) : 0,
                    })),
                    pStart,
                    activeDiscounts,
                  );

                  // Claim discounts atomically
                  for (const line of pricing.lines) {
                    if (line.discountId) {
                      await PricingService.claimDiscountUsageTx(tx, line.discountId);
                    }
                  }

                  // Customer snapshot
                  const customerSnapshot = {
                    id: sub.customer.id,
                    name: sub.customer.name,
                    email: sub.customer.email,
                    company: sub.customer.profile?.company || null,
                    address: sub.customer.profile?.billingAddress || null,
                    taxId: sub.customer.profile?.taxId || null,
                  };

                  const invNumber = getNextInvNum();

                  const createdInvoice = await tx.invoice.create({
                    data: {
                      number: invNumber,
                      subscriptionId: sub.id,
                      customerId: sub.customerId,
                      periodStart: pStart,
                      periodEnd: pEnd,
                      dueDate: pDue,
                      subtotal: pricing.subtotal,
                      discountTotal: pricing.discountTotal,
                      taxTotal: pricing.taxTotal,
                      total: pricing.total,
                      amountPaid: 0,
                      status: autoConfirm ? InvoiceStatus.CONFIRMED : InvoiceStatus.DRAFT,
                      customerSnapshot,
                      lines: {
                        create: pricing.lines.map((l) => ({
                          productId: l.productId,
                          description: l.description,
                          quantity: l.quantity,
                          unitPrice: l.unitPrice,
                          amount: l.amount,
                          discountId: l.discountId,
                          discountAmount: l.discountAmount,
                          taxPercent: l.taxPercent,
                          taxAmount: l.taxAmount,
                        })),
                      },
                    },
                  });

                  createdCount++;

                  // Advance to next period
                  curBillingDate = nextPeriodStart(curBillingDate, sub.plan.billingPeriod, anchorDay);
                }

                // Update subscription's nextBillingDate
                await tx.subscription.update({
                  where: { id: sub.id },
                  data: { nextBillingDate: curBillingDate },
                });
              },
              { timeout: 30000, maxWait: 15000 },
              );
            } catch (err: any) {
              failedCount++;
              errorDetails.push({
                subscriptionId: sub.id,
                error: err.message || 'Unknown billing error',
              });
            }
          }),
        );
      }

      // Update BillingRun summary
      await prisma.billingRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          created: createdCount,
          skipped: skippedCount,
          failed: failedCount,
          errorLog: errorDetails.length > 0 ? (errorDetails as any) : undefined,
        },
      });

      return {
        runId: run.id,
        asOf: effectiveAsOf,
        created: createdCount,
        skipped: skippedCount,
        failed: failedCount,
        errors: errorDetails,
      };
    } finally {
      (global as any).__billingRunActive = false;
      // Release advisory lock across all connections if acquired
      try {
        await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(424242);`);
      } catch {
        // Ignored
      }
    }
  }

  // Invoice management
  static async confirmInvoice(actorId: number, invoiceId: number) {
    const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw Errors.notFound('Invoice', invoiceId);
    if (inv.status !== InvoiceStatus.DRAFT) {
      throw Errors.invalidTransition(inv.status, InvoiceStatus.CONFIRMED);
    }

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.CONFIRMED },
    });

    await audit({
      userId: actorId,
      action: 'INVOICE_CONFIRM',
      entity: 'Invoice',
      entityId: invoiceId,
      newValue: { status: InvoiceStatus.CONFIRMED },
    });

    return updated;
  }

  static async bulkConfirm(actorId: number, invoiceIds: number[]) {
    const confirmed = [];
    for (const id of invoiceIds) {
      try {
        const res = await this.confirmInvoice(actorId, id);
        confirmed.push(res.id);
      } catch {
        // Skip invalid
      }
    }
    return { confirmedCount: confirmed.length, confirmedIds: confirmed };
  }

  static async cancelInvoice(actorId: number, invoiceId: number, reason?: string) {
    return prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { lines: true },
      });
      if (!inv) throw Errors.notFound('Invoice', invoiceId);

      // Guard: CANCELLED only if amountPaid = 0
      if (inv.amountPaid > 0) {
        throw Errors.invoiceNotCancellable();
      }

      if (inv.status === InvoiceStatus.CANCELLED || inv.status === InvoiceStatus.PAID) {
        throw Errors.invalidTransition(inv.status, InvoiceStatus.CANCELLED);
      }

      // Return discount usage
      for (const line of inv.lines) {
        if (line.discountId) {
          await PricingService.returnDiscountUsageTx(tx, line.discountId);
        }
      }

      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: InvoiceStatus.CANCELLED },
      });

      await audit({
        userId: actorId,
        action: 'INVOICE_CANCEL',
        entity: 'Invoice',
        entityId: invoiceId,
        oldValue: { status: inv.status },
        newValue: { status: InvoiceStatus.CANCELLED, reason },
      });

      return updated;
    });
  }
}

