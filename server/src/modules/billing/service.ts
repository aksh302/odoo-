import prisma from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { todayIST, periodEnd, dueDate, nextPeriodStart, isOnOrBefore } from '../../lib/dates';
import { PricingService } from '../pricing/service';
import { config } from '../../config';
import { SubscriptionStatus, InvoiceStatus, Prisma } from '@prisma/client';
import { sendEmail } from '../../lib/mailer';
import { PaginationParams, paginate } from '../../lib/pagination';

export interface BillingRunSummary {
  runId: number;
  asOf: Date;
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{ subscriptionId: number; error: string }>;
}

export interface InvoiceFilters {
  status?: InvoiceStatus;
  customerId?: number;
  subscriptionId?: number;
  overdue?: boolean;
  from?: Date;
  to?: Date;
  q?: string;
}

type ReminderChannel = 'EMAIL' | 'WHATSAPP';

/** Unpaid, confirmed and past its due date. */
function isOverdue(inv: { status: InvoiceStatus; dueDate: Date; total: number; amountPaid: number }, today = todayIST()) {
  return inv.status === InvoiceStatus.CONFIRMED && inv.amountPaid < inv.total && inv.dueDate < today;
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

    // PostgreSQL advisory lock (id 424242), held for the whole run.
    // A transaction-scoped lock (pg_try_advisory_xact_lock) lives on one connection and is
    // released automatically when that transaction ends, even if the run crashes.
    // (The old session lock + pg_advisory_unlock could run on two different pooled
    // connections, so the unlock missed and later runs stayed BILLING_LOCKED.)
    try {
      return await prisma.$transaction(
        async (lockTx) => {
          let lockAcquired = true;
          try {
            const lockRes = await lockTx.$queryRaw<{ locked: boolean }[]>`
              SELECT pg_try_advisory_xact_lock(424242) as locked
            `;
            lockAcquired = lockRes[0]?.locked ?? true;
          } catch {
            // Non-Postgres fallback
            lockAcquired = true;
          }
          if (!lockAcquired) throw Errors.billingLocked();

          return this.processDueSubscriptions(triggeredBy, effectiveAsOf);
        },
        { timeout: 10 * 60 * 1000, maxWait: 15000 },
      );
    } finally {
      (global as any).__billingRunActive = false;
    }
  }

  /** The actual run; called by runBilling while it holds the advisory lock. */
  private static async processDueSubscriptions(
    triggeredBy: string,
    effectiveAsOf: Date,
  ): Promise<BillingRunSummary> {
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
        (d) => d.usageLimit == null || d.usedCount < d.usageLimit,
      );
      // Discounts whose usage limit runs out partway through this run
      const exhaustedDiscounts = new Set<number>();

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
              // One transaction per subscription. Counts are added only once it commits, and a
              // transaction Postgres cancels as a deadlock / serialization conflict is retried.
              let createdHere = 0;
              let skippedHere = 0;
              for (let attempt = 1; ; attempt++) {
                createdHere = 0;
                skippedHere = 0;
                try {
              await prisma.$transaction(
                async (tx) => {
                  if (sub.status !== SubscriptionStatus.ACTIVE || !sub.nextBillingDate) {
                    skippedHere++;
                    return;
                  }

                  // Lock every discount this subscription could use, up front and in id order.
                  // Catch-up billing can claim discounts across several periods; locking them all
                  // first in one fixed order means parallel subscriptions never deadlock.
                  const productIds = new Set(sub.lines.map((l) => l.productId));
                  const lockIds = activeDiscounts
                    .filter((d) => d.scope === 'SUBSCRIPTION' || d.products.some((p) => productIds.has(p.productId)))
                    .map((d) => d.id)
                    .sort((a, b) => a - b);
                  if (lockIds.length) {
                    await tx.$queryRaw`SELECT id FROM "Discount" WHERE id IN (${Prisma.join(lockIds)}) ORDER BY id FOR UPDATE`;
                  }

                  // Catch-up loop: generate invoices until nextBillingDate > effectiveAsOf or sub is expired
                  let curBillingDate = new Date(sub.nextBillingDate);
                  const anchorDay = sub.anchorDay || curBillingDate.getUTCDate();

                while (isOnOrBefore(curBillingDate, effectiveAsOf) && isOnOrBefore(curBillingDate, sub.expiryDate)) {
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

                  // Price the period and claim each discount used. If a discount's usage limit
                  // runs out during this run, bill without it (next best discount, or none)
                  // instead of failing the subscription and leaving the customer unbilled.
                  const priceLines = sub.lines.map((l) => ({
                    productId: l.productId,
                    variantId: l.variantId,
                    description: l.description,
                    quantity: l.quantity,
                    unitPrice: l.unitPrice,
                    taxPercent: l.tax ? Number(l.tax.percent) : 0,
                  }));
                  let pricing;
                  for (;;) {
                    pricing = await PricingService.computePricing(
                      sub.plan,
                      priceLines,
                      pStart,
                      activeDiscounts.filter((d) => !exhaustedDiscounts.has(d.id)),
                    );
                    const claimed: number[] = [];
                    let ranOut: number | null = null;
                    // Claim in discount-id order: every transaction locks discount rows in the same
                    // order, so two subscriptions billed in parallel can't deadlock each other.
                    const toClaim = pricing.lines
                      .map((l) => l.discountId)
                      .filter((id): id is number => !!id)
                      .sort((a, b) => a - b);
                    for (const discountId of toClaim) {
                      try {
                        await PricingService.claimDiscountUsageTx(tx, discountId);
                        claimed.push(discountId);
                      } catch (e: any) {
                        if (e?.code !== 'DISCOUNT_EXHAUSTED') throw e;
                        ranOut = discountId;
                        break;
                      }
                    }
                    if (ranOut === null) break;
                    for (const id of claimed) await PricingService.returnDiscountUsageTx(tx, id);
                    exhaustedDiscounts.add(ranOut);
                  }

                  // Customer snapshot
                  const customerSnapshot = {
                    id: sub.customer.id,
                    name: sub.customer.name,
                    email: sub.customer.email,
                    company: sub.customer.profile?.company || null,
                    phone: sub.customer.profile?.phone || null,
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

                  createdHere++;

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
                  break;
                } catch (err: any) {
                  const retryable = err?.code === 'P2034' || /deadlock detected|could not serialize/i.test(String(err?.message));
                  if (!retryable || attempt >= 3) throw err;
                }
              }
              createdCount += createdHere;
              skippedCount += skippedHere;
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

      // Hand back the numbers this run reserved but didn't use, so invoice numbers stay
      // consecutive (GST needs an unbroken series). Safe: only the billing run, which holds
      // the advisory lock, takes numbers from invoice_seq.
      try {
        await prisma.$executeRaw`SELECT setval('invoice_seq', ${nextSeqCounter}, false)`;
      } catch {
        // Non-Postgres fallback
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
    } catch (err) {
      await prisma.billingRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), failed: failedCount, errorLog: [{ error: (err as Error).message }] as any },
      });
      throw err;
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

  // ---------------------------------------------------------------------------
  // Invoice lists and detail (Staff, Admin)
  // ---------------------------------------------------------------------------

  /** Paged invoice list, newest period first. Each row gets subscriptionNumber and an overdue flag. */
  static async listInvoices(pagination: PaginationParams, f: InvoiceFilters = {}) {
    const today = todayIST();
    const where: Prisma.InvoiceWhereInput = { isSynthetic: false };
    if (f.status) where.status = f.status;
    if (f.customerId) where.customerId = f.customerId;
    if (f.subscriptionId) where.subscriptionId = f.subscriptionId;
    if (f.from || f.to) where.periodStart = { gte: f.from, lte: f.to };
    if (f.overdue) {
      where.status = InvoiceStatus.CONFIRMED;
      where.dueDate = { lt: today };
    }
    if (f.q) {
      const q = f.q.trim();
      where.OR = [
        { number: { contains: q, mode: 'insensitive' } },
        { subscription: { number: { contains: q, mode: 'insensitive' } } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { email: { contains: q, mode: 'insensitive' } } },
        { customer: { profile: { company: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    // amountPaid < total can't be expressed in a Prisma where, so overdue is filtered after the query.
    const query = {
      where,
      include: { subscription: { select: { number: true } } },
      orderBy: [{ periodStart: 'desc' as const }, { id: 'desc' as const }],
    };
    let rows;
    let total;
    if (f.overdue) {
      const all = (await prisma.invoice.findMany(query)).filter((i) => i.amountPaid < i.total);
      total = all.length;
      rows = all.slice(pagination.skip, pagination.skip + pagination.limit);
    } else {
      [rows, total] = await Promise.all([
        prisma.invoice.findMany({ ...query, skip: pagination.skip, take: pagination.limit }),
        prisma.invoice.count({ where }),
      ]);
    }

    const reminders = await this.remindersFor(rows.map((r) => r.id));
    const data = rows.map(({ subscription, ...inv }) => ({
      ...inv,
      subscriptionNumber: subscription.number,
      overdue: isOverdue(inv, today),
      reminders: reminders.get(inv.id) ?? [],
    }));
    return paginate(data, total, pagination);
  }

  /** One invoice with its lines and payments (voided payments included, for the history). */
  static async getInvoice(invoiceId: number, customerIdFilter?: number) {
    const inv = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        subscription: { select: { number: true } },
        lines: { orderBy: { id: 'asc' } },
        payments: { where: { isSynthetic: false }, orderBy: [{ date: 'desc' }, { id: 'desc' }] },
      },
    });
    if (!inv || inv.isSynthetic || (customerIdFilter && inv.customerId !== customerIdFilter)) {
      throw Errors.notFound('Invoice', invoiceId);
    }

    const discountIds = [...new Set(inv.lines.map((l) => l.discountId).filter((x): x is number => !!x))];
    const discounts = discountIds.length
      ? await prisma.discount.findMany({ where: { id: { in: discountIds } }, select: { id: true, name: true } })
      : [];
    const discountName = new Map(discounts.map((d) => [d.id, d.name]));

    const { subscription, lines, payments, ...rest } = inv;
    const reminders = await this.remindersFor([inv.id]);
    return {
      invoice: {
        ...rest,
        subscriptionNumber: subscription.number,
        overdue: isOverdue(inv),
        reminders: reminders.get(inv.id) ?? [],
      },
      lines: lines.map((l) => ({ ...l, discountName: l.discountId ? discountName.get(l.discountId) ?? null : null })),
      payments: customerIdFilter ? payments.filter((p) => !p.voidedAt) : payments,
    };
  }

  // ---------------------------------------------------------------------------
  // Billing run history
  // ---------------------------------------------------------------------------

  static async listRuns(pagination: PaginationParams) {
    const [rows, total] = await Promise.all([
      prisma.billingRun.findMany({
        orderBy: { id: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.billingRun.count(),
    ]);

    // errorLog is stored as [{ subscriptionId, error }]; show subscription numbers instead of ids.
    const subIds = rows.flatMap((r) => ((r.errorLog as any[]) ?? []).map((e) => e.subscriptionId)).filter(Boolean);
    const subs = subIds.length
      ? await prisma.subscription.findMany({ where: { id: { in: subIds } }, select: { id: true, number: true } })
      : [];
    const numberOf = new Map(subs.map((x) => [x.id, x.number]));

    // triggeredBy is stored as "user:<id>" or "cron"; show the person's name
    const userIds = rows.map((r) => /^user:(\d+)$/.exec(r.triggeredBy)?.[1]).filter(Boolean).map(Number);
    const people = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const personName = new Map(people.map((u) => [`user:${u.id}`, u.name]));

    const data = rows.map((r) => ({
      ...r,
      triggeredBy: personName.get(r.triggeredBy) ?? (r.triggeredBy === 'cron' ? 'Daily schedule' : r.triggeredBy),
      errorLog: Array.isArray(r.errorLog) && r.errorLog.length
        ? (r.errorLog as any[]).map((e) => ({
            subscriptionNumber: e.subscriptionId ? numberOf.get(e.subscriptionId) ?? `#${e.subscriptionId}` : '—',
            message: e.error ?? e.message ?? 'Unknown error',
          }))
        : null,
    }));
    return paginate(data, total, pagination);
  }

  /** Confirm every draft invoice (the "Confirm all drafts" button). */
  static async confirmAllDrafts(actorId: number) {
    const drafts = await prisma.invoice.findMany({
      where: { status: InvoiceStatus.DRAFT, isSynthetic: false },
      select: { id: true },
    });
    return this.bulkConfirm(actorId, drafts.map((d) => d.id));
  }

  // ---------------------------------------------------------------------------
  // Payment reminders. Stored as INVOICE_REMIND audit entries, so no schema change is needed.
  // ---------------------------------------------------------------------------

  /** Reminders per invoice, newest first: { at, channel, by }. */
  static async remindersFor(invoiceIds: number[]) {
    const out = new Map<number, Array<{ at: Date; channel: ReminderChannel; by: string | null }>>();
    if (!invoiceIds.length) return out;

    const logs = await prisma.auditLog.findMany({
      where: { action: 'INVOICE_REMIND', entity: 'Invoice', entityId: { in: invoiceIds } },
      orderBy: { id: 'desc' },
    });
    const userIds = [...new Set(logs.map((l) => l.userId).filter((x): x is number => !!x))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, u.name]));

    for (const l of logs) {
      const list = out.get(l.entityId) ?? [];
      list.push({
        at: l.at,
        channel: ((l.newValue as any)?.channel ?? 'EMAIL') as ReminderChannel,
        by: l.userId ? nameOf.get(l.userId) ?? null : null,
      });
      out.set(l.entityId, list);
    }
    return out;
  }

  /**
   * Record a payment reminder. For EMAIL the server sends the email (if SMTP is set up);
   * for WHATSAPP the staff member sends it from their phone and this just records it.
   */
  static async remind(actorId: number | undefined, invoiceId: number, channel: ReminderChannel = 'EMAIL') {
    const inv = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { customer: true },
    });
    if (!inv || inv.isSynthetic) throw Errors.notFound('Invoice', invoiceId);
    if (inv.status !== InvoiceStatus.CONFIRMED || inv.amountPaid >= inv.total) {
      throw Errors.conflict('Only unpaid confirmed invoices can be chased');
    }

    let delivered = false;
    if (channel === 'EMAIL') {
      const due = ((inv.total - inv.amountPaid) / 100).toFixed(2);
      delivered = await sendEmail({
        to: inv.customer.email,
        subject: `Payment reminder: invoice ${inv.number}`,
        html:
          `<p>Dear ${inv.customer.name},</p>` +
          `<p>This is a reminder that ₹${due} is outstanding on invoice <b>${inv.number}</b>, ` +
          `due on ${inv.dueDate.toISOString().slice(0, 10)}.</p>` +
          `<p>Please quote the invoice number with your payment. Thank you.</p>`,
      });
    }

    await audit({
      userId: actorId,
      action: 'INVOICE_REMIND',
      entity: 'Invoice',
      entityId: invoiceId,
      newValue: { channel, delivered },
    });

    return (await this.getInvoice(invoiceId)).invoice;
  }

  /** Email every overdue invoice, at most once per invoice per day ("Remind all overdue" button). */
  static async remindOverdue(actorId?: number) {
    const today = todayIST();
    const overdue = (
      await prisma.invoice.findMany({
        where: { status: InvoiceStatus.CONFIRMED, isSynthetic: false, dueDate: { lt: today } },
        select: { id: true, total: true, amountPaid: true },
      })
    ).filter((i) => i.amountPaid < i.total);

    const reminders = await this.remindersFor(overdue.map((i) => i.id));
    const todayStr = new Date().toISOString().slice(0, 10);
    let sent = 0;
    for (const inv of overdue) {
      const already = (reminders.get(inv.id) ?? []).some(
        (r) => r.channel === 'EMAIL' && new Date(r.at).toISOString().slice(0, 10) === todayStr,
      );
      if (already) continue;
      await this.remind(actorId, inv.id, 'EMAIL');
      sent++;
    }
    return { sent };
  }
}
