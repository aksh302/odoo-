import { Router } from 'express';
import { ReportsService } from './service';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { getPagination } from '../../lib/pagination';
import { Role } from '@prisma/client';

const router = Router();

// Staff & Admin: Dashboard KPIs
// Optional filters: ?customerId, planId, from, to (payment dates for revenue)
router.get('/summary', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const num = (v: unknown) => (v ? parseInt(v as string, 10) : undefined);
    const day = (v: unknown) => (v ? new Date(v as string) : undefined);
    const kpis = await ReportsService.getSummaryKpis({
      customerId: num(req.query.customerId),
      planId: num(req.query.planId),
      from: day(req.query.from),
      to: day(req.query.to),
    });
    res.json(kpis);
  } catch (err) {
    next(err);
  }
});

// Overdue list
router.get('/overdue', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (_req, res, next) => {
  try {
    const kpis = await ReportsService.getSummaryKpis();
    res.json(kpis.overdue);
  } catch (err) {
    next(err);
  }
});

// Aging buckets
router.get('/aging', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (_req, res, next) => {
  try {
    const kpis = await ReportsService.getSummaryKpis();
    res.json(kpis.aging);
  } catch (err) {
    next(err);
  }
});

// CSV Export (available at both /export/invoices and /csv)
const handleCsvExport = async (_req: any, res: any, next: any) => {
  try {
    const csv = await ReportsService.exportInvoicesCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
};
router.get('/export/invoices', requireAuth, requireRole(Role.ADMIN, Role.STAFF), handleCsvExport);
router.get('/csv', requireAuth, requireRole(Role.ADMIN, Role.STAFF), handleCsvExport);

// Audit Log: Read allowed for Admin + Staff per SRS 2.1
router.get('/audit', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const pagination = getPagination(req);
    const logs = await ReportsService.getAuditLogs(pagination.page, pagination.limit);
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

export default router;

