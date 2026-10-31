import { Router } from 'express';
import prisma from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { getPagination } from '../../lib/pagination';
import { Role, SubscriptionStatus } from '@prisma/client';
import { SubscriptionService } from '../subscriptions/service';
import { CreateSubscriptionSchema } from '../subscriptions/schemas';
import { validate } from '../../middleware/validate';

const router = Router();

// Customer only portal routes
router.use(requireAuth);
router.use(requireRole(Role.CUSTOMER));

// Own Profile
router.get('/profile', async (req, res, next) => {
  try {
    const customer = await prisma.user.findUnique({
      where: { id: req.user!.customerId },
      include: { profile: true },
    });
    if (!customer) throw Errors.notFound('Profile');
    res.json({ customer });
  } catch (err) {
    next(err);
  }
});

// Own Subscriptions
router.get('/subscriptions', async (req, res, next) => {
  try {
    const pagination = getPagination(req);
    const result = await SubscriptionService.listSubscriptions(pagination, {
      customerId: req.user!.customerId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/subscriptions/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const sub = await SubscriptionService.getSubscription(id, req.user!.customerId);
    res.json({ subscription: sub });
  } catch (err) {
    next(err);
  }
});

// Self-subscribe (create subscription for oneself)
router.post(
  '/subscriptions/self-subscribe',
  validate({ body: CreateSubscriptionSchema.omit({ customerId: true }) }),
  async (req, res, next) => {
    try {
      const sub = await SubscriptionService.createSubscription(req.user!.userId, {
        ...req.body,
        customerId: req.user!.customerId!,
      });
      res.status(201).json({ subscription: sub });
    } catch (err) {
      next(err);
    }
  },
);

// Portal Pause / Resume / Renew / Close
router.post('/subscriptions/:id/pause', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const sub = await SubscriptionService.transitionStatus(
      req.user!.userId,
      id,
      SubscriptionStatus.PAUSED,
      req.user!.customerId,
    );
    res.json({ subscription: sub });
  } catch (err) {
    next(err);
  }
});

router.post('/subscriptions/:id/resume', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const sub = await SubscriptionService.transitionStatus(
      req.user!.userId,
      id,
      SubscriptionStatus.ACTIVE,
      req.user!.customerId,
    );
    res.json({ subscription: sub });
  } catch (err) {
    next(err);
  }
});

router.post('/subscriptions/:id/renew', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const sub = await SubscriptionService.renewSubscription(
      req.user!.userId,
      id,
      req.user!.customerId,
    );
    res.json({ subscription: sub });
  } catch (err) {
    next(err);
  }
});

router.post('/subscriptions/:id/close', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const sub = await SubscriptionService.transitionStatus(
      req.user!.userId,
      id,
      SubscriptionStatus.CLOSED,
      req.user!.customerId,
    );
    res.json({ subscription: sub });
  } catch (err) {
    next(err);
  }
});

// Own Invoices
router.get('/invoices', async (req, res, next) => {
  try {
    const pagination = getPagination(req);
    const where = {
      customerId: req.user!.customerId,
      isSynthetic: false,
    };

    const [data, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { id: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json({ data, page: pagination.page, limit: pagination.limit, total });
  } catch (err) {
    next(err);
  }
});

router.get('/invoices/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const inv = await prisma.invoice.findFirst({
      where: {
        id,
        customerId: req.user!.customerId,
        isSynthetic: false,
      },
      include: { lines: true, payments: true },
    });

    if (!inv) throw Errors.notFound('Invoice', id);
    res.json({ invoice: inv });
  } catch (err) {
    next(err);
  }
});

export default router;

