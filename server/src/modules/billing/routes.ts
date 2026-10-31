import { Router } from 'express';
import { BillingService } from './service';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { Role } from '@prisma/client';
import { getPagination } from '../../lib/pagination';
import {
  RunBillingSchema,
  BulkConfirmInvoiceSchema,
  CancelInvoiceSchema,
  ListInvoicesQuerySchema,
  ConfirmDraftsSchema,
  RemindSchema,
} from './schemas';

const router = Router();

// Trigger billing run manually (Admin, Staff per SRS 2.1)
router.post(
  '/run',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  validate({ body: RunBillingSchema }),
  async (req, res, next) => {
    try {
      const summary = await BillingService.runBilling(
        `user:${req.user!.userId}`,
        req.body.asOf,
      );
      res.json(summary);
    } catch (err) {
      next(err);
    }
  },
);

// Billing run history
router.get('/runs', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const result = await BillingService.listRuns(getPagination(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// List invoices: ?status, customerId, subscriptionId, overdue=true, from, to (period start), q
router.get(
  '/invoices',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  validate({ query: ListInvoicesQuerySchema }),
  async (req, res, next) => {
    try {
      const q = req.query as any;
      const result = await BillingService.listInvoices(getPagination(req), {
        status: q.status,
        customerId: q.customerId,
        subscriptionId: q.subscriptionId,
        overdue: q.overdue === 'true',
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
        q: q.q,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// Confirm drafts: the given ids, or every draft when invoiceIds is left out
router.post(
  '/invoices/confirm-drafts',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  validate({ body: ConfirmDraftsSchema }),
  async (req, res, next) => {
    try {
      const result = req.body.invoiceIds?.length
        ? await BillingService.bulkConfirm(req.user!.userId, req.body.invoiceIds)
        : await BillingService.confirmAllDrafts(req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// Email a reminder for every overdue invoice (once per invoice per day)
router.post('/invoices/remind-overdue', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const result = await BillingService.remindOverdue(req.user!.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// One invoice with lines and payments
router.get('/invoices/:id', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const result = await BillingService.getInvoice(parseInt(req.params.id as string, 10));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Record a payment reminder ({ channel: 'EMAIL' | 'WHATSAPP' }); EMAIL is sent by the server
router.post(
  '/invoices/:id/remind',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  validate({ body: RemindSchema }),
  async (req, res, next) => {
    try {
      const invoice = await BillingService.remind(
        req.user!.userId,
        parseInt(req.params.id as string, 10),
        req.body.channel,
      );
      res.json({ invoice });
    } catch (err) {
      next(err);
    }
  },
);

// Bulk confirm invoices
router.post(
  '/invoices/bulk-confirm',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  validate({ body: BulkConfirmInvoiceSchema }),
  async (req, res, next) => {
    try {
      const result = await BillingService.bulkConfirm(req.user!.userId, req.body.invoiceIds);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// Confirm single invoice
router.post(
  '/invoices/:id/confirm',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  async (req, res, next) => {
    try {
      const inv = await BillingService.confirmInvoice(
        req.user!.userId,
        parseInt(req.params.id as string, 10),
      );
      res.json({ invoice: inv });
    } catch (err) {
      next(err);
    }
  },
);

// Cancel invoice
router.post(
  '/invoices/:id/cancel',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  validate({ body: CancelInvoiceSchema }),
  async (req, res, next) => {
    try {
      const inv = await BillingService.cancelInvoice(
        req.user!.userId,
        parseInt(req.params.id as string, 10),
        req.body.reason,
      );
      res.json({ invoice: inv });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

