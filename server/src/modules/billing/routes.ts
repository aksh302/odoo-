import { Router } from 'express';
import { BillingService } from './service';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { Role } from '@prisma/client';
import { RunBillingSchema, BulkConfirmInvoiceSchema, CancelInvoiceSchema } from './schemas';

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

