import prisma from '../../lib/prisma';
import { todayIST, mrrMultiplier, diffDays } from '../../lib/dates';
import { SubscriptionStatus, InvoiceStatus } from '@prisma/client';

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
  static async getSummaryKpis() {
    const today = todayIST();

    // 1. Active subscriptions and recurring amounts for MRR/ARR via high-performance SQL aggregate
    const mrrRes = await prisma.$queryRaw<Array<{ active_count: number; mrr: bigint }>>`
      SELECT 
        COUNT(DISTINCT s."id")::int as active_count,
        COALESCE(SUM(
          (p."price" + COALESCE(lines.line_sum, 0)) * 
          CASE p."billingPeriod"
            WHEN 'DAILY' THEN 30
            WHEN 'WEEKLY' THEN 4.333333333333333
            WHEN 'MONTHLY' THEN 1
            WHEN 'YEARLY' THEN 0.08333333333333333
            ELSE 1
          END
        ), 0)::bigint as mrr
      FROM "Subscription" s
      JOIN "Plan" p ON p."id" = s."planId"
      LEFT JOIN (
        SELECT "subscriptionId", SUM("amount") as line_sum 
        FROM "SubscriptionLine" 
        GROUP BY "subscriptionId"
      ) lines ON lines."subscriptionId" = s."id"
      WHERE s."status" = 'ACTIVE' AND s."isSynthetic" = false
    `;

    const activeCount = mrrRes[0]?.active_count || 0;
    const mrrPaise = Number(mrrRes[0]?.mrr || 0);
    const arrPaise = mrrPaise * 12;

    // 2. Revenue collected (sum of non-voided payments)
    const revAggr = await prisma.payment.aggregate({
      where: {
        voidedAt: null,
        isSynthetic: false,
      },
      _sum: { amount: true },
    });
    const revenueCollectedPaise = revAggr._sum.amount || 0;

    // 3. Outstanding and Overdue invoices (status = CONFIRMED)
    const confirmedInvoices = await prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.CONFIRMED,
        isSynthetic: false,
      },
      select: {
        total: true,
        amountPaid: true,
        dueDate: true,
      },
    });

    let outstandingPaise = 0;
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

