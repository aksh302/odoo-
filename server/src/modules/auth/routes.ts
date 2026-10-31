import { Router } from 'express';
import { AuthService } from './service';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { authLimiter, forgotPasswordLimiter } from '../../middleware/rateLimit';
import { getPagination } from '../../lib/pagination';
import { Role } from '@prisma/client';
import {
  SignupSchema,
  LoginSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  CreateStaffSchema,
  CreateCustomerSchema,
  UpdateCustomerSchema,
} from './schemas';

const router = Router();

// Public auth routes
router.post('/signup', validate({ body: SignupSchema }), async (req, res, next) => {
  try {
    const result = await AuthService.signup(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, validate({ body: LoginSchema }), async (req, res, next) => {
  try {
    const result = await AuthService.login(req.body.email, req.body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate({ body: ForgotPasswordSchema }),
  async (req, res, next) => {
    try {
      const result = await AuthService.forgotPassword(req.body.email);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post('/reset-password', validate({ body: ResetPasswordSchema }), async (req, res, next) => {
  try {
    const result = await AuthService.resetPassword(req.body.token, req.body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Authenticated current user
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await AuthService.getMe(req.user!.userId);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

// Admin-only: Create staff
router.post(
  '/staff',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: CreateStaffSchema }),
  async (req, res, next) => {
    try {
      const staff = await AuthService.createStaff(req.user!.userId, req.body);
      res.status(201).json({ staff });
    } catch (err) {
      next(err);
    }
  },
);

// Admin-only: Deactivate any user
router.post(
  '/users/:id/deactivate',
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res, next) => {
    try {
      const targetId = parseInt(req.params.id as string, 10);
      const result = await AuthService.deactivateUser(req.user!.userId, targetId);
      res.json({ success: true, user: result });
    } catch (err) {
      next(err);
    }
  },
);

// Customers CRUD (Admin + Staff)
router.get('/customers', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const pagination = getPagination(req);
    const result = await AuthService.listCustomers(pagination);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/customers/:id', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const customer = await AuthService.getCustomer(parseInt(req.params.id as string, 10));
    res.json({ customer });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/customers',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  validate({ body: CreateCustomerSchema }),
  async (req, res, next) => {
    try {
      const customer = await AuthService.createCustomer(req.user!.userId, req.body);
      res.status(201).json({ customer });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/customers/:id',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  validate({ body: UpdateCustomerSchema }),
  async (req, res, next) => {
    try {
      const customer = await AuthService.updateCustomer(
        req.user!.userId,
        parseInt(req.params.id as string, 10),
        req.body,
      );
      res.json({ customer });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
