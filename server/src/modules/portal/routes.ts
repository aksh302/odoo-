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
import { todayIST } from '../../lib/dates';
import { BillingService } from '../billing/service';
import { PaymentService } from '../payments/service';

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
      // Only plans on sale today can be picked from the portal
      const plan = req.body.planId ? await prisma.plan.findUnique({ where: { id: req.body.planId } }) : null;
      const today = todayIST();
      if (plan && (plan.isArchived || plan.startDate > today || plan.endDate < today)) {
        throw Errors.validationError({ planId: 'This plan is not available' });
      }

      const created = await SubscriptionService.createSubscription(req.user!.userId, {
        ...req.body,
        customerId: req.user!.customerId!,
      });
      // A customer's request arrives as a Quotation for staff to review and confirm
      const sub = await SubscriptionService.transitionStatus(
        req.user!.userId,
        created.id,
        SubscriptionStatus.QUOTATION,
      );
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

// Own Invoices (same row shape as the staff list: subscriptionNumber, overdue flag)
router.get('/invoices', async (req, res, next) => {
  try {
    const result = await BillingService.listInvoices(getPagination(req), {
      customerId: req.user!.customerId,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/invoices/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    // Same shape as the staff view ({ invoice, lines, payments }), limited to this customer
    // and without voided payments.
    const result = await BillingService.getInvoice(id, req.user!.customerId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Own payments (not voided), newest first
router.get('/payments', async (req, res, next) => {
  try {
    const result = await PaymentService.listPayments(getPagination(req), {
      customerId: req.user!.customerId,
      includeVoided: false,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

