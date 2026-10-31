import { Router } from 'express';
import { PricingService } from './service';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { getPagination } from '../../lib/pagination';
import { Role } from '@prisma/client';
import { CreateDiscountSchema, UpdateDiscountSchema } from './schemas';

const router = Router();

router.get('/discounts', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const pagination = getPagination(req);
    const result = await PricingService.listDiscounts(pagination);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/discounts',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: CreateDiscountSchema }),
  async (req, res, next) => {
    try {
      const discount = await PricingService.createDiscount(req.user!.userId, req.body);
      res.status(201).json({ discount });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/discounts/:id',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: UpdateDiscountSchema }),
  async (req, res, next) => {
    try {
      const discount = await PricingService.updateDiscount(
        req.user!.userId,
        parseInt(req.params.id as string, 10),
        req.body,
      );
      res.json({ discount });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

