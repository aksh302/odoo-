import { Router } from 'express';
import { SubscriptionService } from './service';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { getPagination } from '../../lib/pagination';
import { Role, SubscriptionStatus } from '@prisma/client';
import { CreateSubscriptionSchema, TransitionSubscriptionSchema } from './schemas';

const router = Router();

// Staff & Admin subscription operations
router.get('/', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const pagination = getPagination(req);
    const customerId = req.query.customerId ? parseInt(req.query.customerId as string, 10) : undefined;
    const status = req.query.status as SubscriptionStatus | undefined;
    const result = await SubscriptionService.listSubscriptions(pagination, { customerId, status });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const sub = await SubscriptionService.getSubscription(parseInt(req.params.id as string, 10));
    res.json({ subscription: sub });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  validate({ body: CreateSubscriptionSchema }),
  async (req, res, next) => {
    try {
      const sub = await SubscriptionService.createSubscription(req.user!.userId, req.body);
      res.status(201).json({ subscription: sub });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:id/transition',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  validate({ body: TransitionSubscriptionSchema }),
  async (req, res, next) => {
    try {
      const sub = await SubscriptionService.transitionStatus(
        req.user!.userId,
        parseInt(req.params.id as string, 10),
        req.body.status,
      );
      res.json({ subscription: sub });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/:id/pause', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const sub = await SubscriptionService.transitionStatus(
      req.user!.userId,
      parseInt(req.params.id as string, 10),
      SubscriptionStatus.PAUSED,
    );
    res.json({ subscription: sub });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/resume', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const sub = await SubscriptionService.transitionStatus(
      req.user!.userId,
      parseInt(req.params.id as string, 10),
      SubscriptionStatus.ACTIVE,
    );
    res.json({ subscription: sub });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/renew', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const sub = await SubscriptionService.renewSubscription(
      req.user!.userId,
      parseInt(req.params.id as string, 10),
    );
    res.json({ subscription: sub });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/close', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const sub = await SubscriptionService.transitionStatus(
      req.user!.userId,
      parseInt(req.params.id as string, 10),
      SubscriptionStatus.CLOSED,
    );
    res.json({ subscription: sub });
  } catch (err) {
    next(err);
  }
});

export default router;

