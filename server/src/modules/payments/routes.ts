import { Router } from 'express';
import { PaymentService } from './service';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { getPagination } from '../../lib/pagination';
import { Role } from '@prisma/client';
import { RecordPaymentSchema, VoidPaymentSchema } from './schemas';
import { BillingService } from '../billing/service';

const router = Router();

// Staff & Admin: List payments
router.get('/', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const pagination = getPagination(req);
    const num = (v: unknown) => (v ? parseInt(v as string, 10) : undefined);
    const day = (v: unknown) => (v ? new Date(v as string) : undefined);
    const result = await PaymentService.listPayments(pagination, {
      invoiceId: num(req.query.invoiceId),
      customerId: num(req.query.customerId),
      from: day(req.query.from),
      to: day(req.query.to),
      q: req.query.q as string | undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Record a payment (Staff, Admin)
router.post(
  '/',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  validate({ body: RecordPaymentSchema }),
  async (req, res, next) => {
    try {
      const payment = await PaymentService.recordPayment(req.user!.userId, req.body);
      // Also return the updated invoice (amountPaid, status) so the screen can refresh in one go
      const { invoice } = await BillingService.getInvoice(payment.invoiceId);
      res.status(201).json({ payment, invoice });
    } catch (err) {
      next(err);
    }
  },
);

// Void a payment (Admin only per SRS 2.1)
router.post(
  '/:id/void',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: VoidPaymentSchema }),
  async (req, res, next) => {
    try {
      const payment = await PaymentService.voidPayment(
        req.user!.userId,
        parseInt(req.params.id as string, 10),
        req.body.reason,
      );
      const { invoice } = await BillingService.getInvoice(payment.invoiceId);
      res.json({ success: true, payment, invoice });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

