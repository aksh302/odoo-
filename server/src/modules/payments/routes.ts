import { Router } from 'express';
import { PaymentService } from './service';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { getPagination } from '../../lib/pagination';
import { Role } from '@prisma/client';
import { RecordPaymentSchema, VoidPaymentSchema } from './schemas';

const router = Router();

// Staff & Admin: List payments
router.get('/', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const pagination = getPagination(req);
    const invoiceId = req.query.invoiceId ? parseInt(req.query.invoiceId as string, 10) : undefined;
    const result = await PaymentService.listPayments(pagination, invoiceId);
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
      res.status(201).json({ payment });
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
      res.json({ success: true, payment });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

