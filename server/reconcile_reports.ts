import prisma from './src/lib/prisma';
import { ReportsService } from './src/modules/reports/service';
import { todayIST } from './src/lib/dates';

async function main() {
  console.log('--- RECONCILING REPORTS WITH RAW SQL AGGREGATES ---');
  const today = todayIST();

  const reportKpis = await ReportsService.getSummaryKpis();

  // 1. Active count
  const sqlActive = await prisma.$queryRaw<any[]>`
    SELECT count(*)::int as count FROM "Subscription" WHERE status = 'ACTIVE' AND "isSynthetic" = false;
  `;

  // 2. Revenue collected
  const sqlRev = await prisma.$queryRaw<any[]>`
    SELECT coalesce(sum(amount), 0)::bigint as total FROM "Payment" WHERE "voidedAt" IS NULL AND "isSynthetic" = false;
  `;

  // 3. Outstanding
  const sqlOutstanding = await prisma.$queryRaw<any[]>`
    SELECT coalesce(sum(total - "amountPaid"), 0)::bigint as total FROM "Invoice" WHERE status = 'CONFIRMED' AND "isSynthetic" = false;
  `;

  // 4. Overdue
  const sqlOverdue = await prisma.$queryRaw<any[]>`
    SELECT count(*)::int as count, coalesce(sum(total - "amountPaid"), 0)::bigint as total 
    FROM "Invoice" 
    WHERE status = 'CONFIRMED' AND "dueDate" < ${today} AND "amountPaid" < total AND "isSynthetic" = false;
  `;

  console.log(`Active Count:      Report = ${reportKpis.activeSubscriptions} | SQL = ${sqlActive[0].count} (Match: ${reportKpis.activeSubscriptions === sqlActive[0].count})`);
  console.log(`Revenue Collected: Report = ${reportKpis.revenueCollected} | SQL = ${Number(sqlRev[0].total)} (Match: ${reportKpis.revenueCollected === Number(sqlRev[0].total)})`);
  console.log(`Outstanding:       Report = ${reportKpis.outstanding} | SQL = ${Number(sqlOutstanding[0].total)} (Match: ${reportKpis.outstanding === Number(sqlOutstanding[0].total)})`);
  console.log(`Overdue Count:     Report = ${reportKpis.overdue.count} | SQL = ${sqlOverdue[0].count} (Match: ${reportKpis.overdue.count === sqlOverdue[0].count})`);
  console.log(`Overdue Amount:    Report = ${reportKpis.overdue.amount} | SQL = ${Number(sqlOverdue[0].total)} (Match: ${reportKpis.overdue.amount === Number(sqlOverdue[0].total)})`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

