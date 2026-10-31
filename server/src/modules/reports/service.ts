import prisma from '../../lib/prisma';
import { todayIST, mrrMultiplier, diffDays } from '../../lib/dates';
import { InvoiceStatus, Prisma } from '@prisma/client';

export interface SummaryFilters {
  customerId?: number;
  planId?: number;
  /** payment-date range for revenue collected */
  from?: Date;
  to?: Date;
}

export class ReportsService {
  /**
   * Summary KPIs per SRS 2.4:
   * - Active subscriptions count
   * - MRR & ARR
   * - Revenue collected (sum of non-voided payments)
   * - Outstanding (total - amountPaid for CONFIRMED)
   * - Overdue (CONFIRMED, dueDate < today, amountPaid < total)
   * - Aging buckets (0-30, 31-60, 61-90, 90+ days)
   * All queries exclude synthetic rows (isSynthetic = false).
   */
  static async getSummaryKpis(filters: SummaryFilters = {}) {
    const today = todayIST();
    const { customerId, planId } = filters;
    // Revenue range (payment dates): default the last 12 months including this one.
    const to = filters.to ?? today;
    const from = filters.from ?? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));

    const subFilter = Prisma.sql`
      ${customerId ? Prisma.sql`AND s."customerId" = ${customerId}` : Prisma.empty}
      ${planId ? Prisma.sql`AND s."planId" = ${planId}` : Prisma.empty}
    `;
    const monthlySql = Prisma.sql`
      (p."price" + COALESCE(lines.line_sum, 0)) *
      CASE p."billingPeriod"
        WHEN 'DAILY' THEN 30
        WHEN 'WEEKLY' THEN 4.333333333333333
        WHEN 'MONTHLY' THEN 1
        WHEN 'YEARLY' THEN 0.08333333333333333
        ELSE 1
      END
    `;
    const linesJoin = Prisma.sql`
      LEFT JOIN (
        SELECT "subscriptionId", SUM("amount") as line_sum
        FROM "SubscriptionLine"
        GROUP BY "subscriptionId"
      ) lines ON lines."subscriptionId" = s."id"
    `;

    // 1. Active subscriptions and recurring amounts for MRR/ARR via high-performance SQL aggregate
    const mrrRes = await prisma.$queryRaw<Array<{ active_count: number; mrr: bigint }>>`
      SELECT
        COUNT(DISTINCT s."id")::int as active_count,
        COALESCE(SUM(${monthlySql}), 0)::bigint as mrr
      FROM "Subscription" s
      JOIN "Plan" p ON p."id" = s."planId"
      ${linesJoin}
      WHERE s."status" = 'ACTIVE' AND s."isSynthetic" = false ${subFilter}
    `;

    const activeCount = mrrRes[0]?.active_count || 0;
    const mrrPaise = Number(mrrRes[0]?.mrr || 0);
    const arrPaise = mrrPaise * 12;

    // Invoices limited to the chosen customer / plan
    const invoiceWhere: Prisma.InvoiceWhereInput = { isSynthetic: false };
    if (customerId) invoiceWhere.customerId = customerId;
    if (planId) invoiceWhere.subscription = { planId };

    // 2. Revenue collected in the range (non-voided payments), plus a bucket per month
    const payments = await prisma.payment.findMany({
      where: { voidedAt: null, isSynthetic: false, date: { gte: from, lte: to }, invoice: invoiceWhere },
      select: { amount: true, date: true },
    });
    const revenueCollectedPaise = payments.reduce((sum, p) => sum + p.amount, 0);

    const revenueByMonth: Array<{ month: string; collected: number }> = [];
    for (
      let m = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
      m <= to;
      m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))
    ) {
      const key = m.toISOString().slice(0, 7);
      revenueByMonth.push({
        month: key,
        collected: payments.filter((p) => p.date.toISOString().startsWith(key)).reduce((a, p) => a + p.amount, 0),
      });
    }

    // 3. Outstanding and Overdue invoices (status = CONFIRMED)
    const confirmedInvoices = await prisma.invoice.findMany({
      where: { ...invoiceWhere, status: InvoiceStatus.CONFIRMED },
      select: {
        total: true,
        amountPaid: true,
        dueDate: true,
      },
    });
    const paidCount = await prisma.invoice.count({ where: { ...invoiceWhere, status: InvoiceStatus.PAID } });

    let outstandingPaise = 0;
    let outstandingCount = 0;
    let overduePaise = 0;
    let overdueCount = 0;

    const aging = {
      days_0_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_90_plus: 0,
    };

    for (const inv of confirmedInvoices) {
      const remaining = inv.total - inv.amountPaid;
      outstandingPaise += remaining;
      if (remaining > 0) outstandingCount++;

      if (inv.dueDate < today && remaining > 0) {
        overduePaise += remaining;
        overdueCount++;

        const daysOver = diffDays(today, inv.dueDate);
        if (daysOver <= 30) {
          aging.days_0_30 += remaining;
        } else if (daysOver <= 60) {
          aging.days_31_60 += remaining;
        } else if (daysOver <= 90) {
          aging.days_61_90 += remaining;
        } else {
          aging.days_90_plus += remaining;
        }
      }
    }

    return {
      activeSubscriptions: activeCount,
      mrr: mrrPaise,
      arr: arrPaise,
      revenueCollected: revenueCollectedPaise,
      outstanding: outstandingPaise,
      overdue: {
        count: overdueCount,
        amount: overduePaise,
      },
      aging,
      counts: { paid: paidCount, outstanding: outstandingCount, overdue: overdueCount },
      revenueByMonth,
      mrrMovement: await this.getMrrMovement(subFilter, monthlySql, linesJoin),
    };
  }

  /**
   * How MRR moved this calendar month: subscriptions that started this month, and ones
   * paused or closed this month (read from SUBSCRIPTION_STATUS audit entries).
   */
  private static async getMrrMovement(subFilter: Prisma.Sql, monthlySql: Prisma.Sql, linesJoin: Prisma.Sql) {
    const today = todayIST();
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

    const rows = await prisma.$queryRaw<Array<{ kind: string; n: number; mrr: bigint }>>`
      SELECT 'new' as kind, COUNT(*)::int as n, COALESCE(SUM(${monthlySql}), 0)::bigint as mrr
      FROM "Subscription" s
      JOIN "Plan" p ON p."id" = s."planId"
      ${linesJoin}
      WHERE s."isSynthetic" = false AND s."status" IN ('ACTIVE', 'PAUSED')
        AND s."startDate" >= ${monthStart} ${subFilter}
      UNION ALL
      SELECT st.to_status as kind, COUNT(*)::int as n, COALESCE(SUM(${monthlySql}), 0)::bigint as mrr
      FROM (
        SELECT DISTINCT a."entityId" as sub_id, a."newValue"->>'status' as to_status
        FROM "AuditLog" a
        WHERE a."action" = 'SUBSCRIPTION_STATUS' AND a."entity" = 'Subscription'
          AND a."at" >= ${monthStart}
          AND a."newValue"->>'status' IN ('PAUSED', 'CLOSED')
      ) st
      JOIN "Subscription" s ON s."id" = st.sub_id
      JOIN "Plan" p ON p."id" = s."planId"
      ${linesJoin}
      WHERE s."isSynthetic" = false AND s."status"::text = st.to_status ${subFilter}
      GROUP BY st.to_status
    `;
    const get = (kind: string) => rows.find((r) => r.kind === kind);
    return {
      newMrr: Number(get('new')?.mrr ?? 0),
      newCount: get('new')?.n ?? 0,
      pausedMrr: Number(get('PAUSED')?.mrr ?? 0),
      pausedCount: get('PAUSED')?.n ?? 0,
      closedMrr: Number(get('CLOSED')?.mrr ?? 0),
      closedCount: get('CLOSED')?.n ?? 0,
    };
  }

  static async exportInvoicesCsv(): Promise<string> {
    const invoices = await prisma.invoice.findMany({
      where: { isSynthetic: false },
      include: {
        customer: { select: { name: true, email: true } },
      },
      orderBy: { id: 'desc' },
      take: 5000,
    });

    const header = 'Number,Customer,Email,PeriodStart,PeriodEnd,DueDate,Subtotal,Discount,Tax,Total,AmountPaid,Status\n';
    const rows = invoices.map((inv) => [
      inv.number,
      `"${inv.customer.name.replace(/"/g, '""')}"`,
      inv.customer.email,
      inv.periodStart.toISOString().split('T')[0],
      inv.periodEnd.toISOString().split('T')[0],
      inv.dueDate.toISOString().split('T')[0],
      (inv.subtotal / 100).toFixed(2),
      (inv.discountTotal / 100).toFixed(2),
      (inv.taxTotal / 100).toFixed(2),
      (inv.total / 100).toFixed(2),
      (inv.amountPaid / 100).toFixed(2),
      inv.status,
    ].join(','));

    return header + rows.join('\n');
  }

  static async getAuditLogs(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      prisma.auditLog.count(),
    ]);

    return {
      data,
      page,
      limit,
      total,
    };
  }
}

