import { Router } from 'express';
import { CatalogService } from './service';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { getPagination } from '../../lib/pagination';
import { Role } from '@prisma/client';
import {
  CreateTaxSchema,
  UpdateTaxSchema,
  CreateProductSchema,
  UpdateProductSchema,
  CreateVariantSchema,
  UpdateVariantSchema,
  CreatePlanSchema,
  UpdatePlanSchema,
} from './schemas';

const router = Router();

// --- Taxes ---
router.get('/taxes', requireAuth, async (_req, res, next) => {
  try {
    const taxes = await CatalogService.listTaxes();
    res.json({ taxes });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/taxes',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: CreateTaxSchema }),
  async (req, res, next) => {
    try {
      const tax = await CatalogService.createTax(req.user!.userId, req.body);
      res.status(201).json({ tax });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/taxes/:id',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: UpdateTaxSchema }),
  async (req, res, next) => {
    try {
      const tax = await CatalogService.updateTax(
        req.user!.userId,
        parseInt(req.params.id as string, 10),
        req.body,
      );
      res.json({ tax });
    } catch (err) {
      next(err);
    }
  },
);

// --- Products ---
router.get('/products', requireAuth, async (req, res, next) => {
  try {
    const pagination = getPagination(req);
    const includeArchived = req.query.includeArchived === 'true' && req.user!.role === Role.ADMIN;
    const result = await CatalogService.listProducts(pagination, includeArchived);
    // Customers browse products in the portal, but cost prices are internal
    if (req.user!.role === Role.CUSTOMER) {
      result.data = result.data.map(({ costPrice: _cost, ...p }: any) => p);
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/products/:id', requireAuth, async (req, res, next) => {
  try {
    const { costPrice, ...rest } = await CatalogService.getProduct(parseInt(req.params.id as string, 10));
    res.json({ product: req.user!.role === Role.CUSTOMER ? rest : { ...rest, costPrice } });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/products',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: CreateProductSchema }),
  async (req, res, next) => {
    try {
      const product = await CatalogService.createProduct(req.user!.userId, req.body);
      res.status(201).json({ product });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/products/:id',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: UpdateProductSchema }),
  async (req, res, next) => {
    try {
      const product = await CatalogService.updateProduct(
        req.user!.userId,
        parseInt(req.params.id as string, 10),
        req.body,
      );
      res.json({ product });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/products/:id/archive', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const product = await CatalogService.archiveProduct(
      req.user!.userId,
      parseInt(req.params.id as string, 10),
    );
    res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
});

router.post('/products/:id/restore', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const product = await CatalogService.restoreProduct(
      req.user!.userId,
      parseInt(req.params.id as string, 10),
    );
    res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
});

// --- Variants ---
router.post(
  '/variants',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: CreateVariantSchema }),
  async (req, res, next) => {
    try {
      const variant = await CatalogService.createVariant(req.user!.userId, req.body);
      res.status(201).json({ variant });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/variants/:id/archive', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const variant = await CatalogService.archiveVariant(
      req.user!.userId,
      parseInt(req.params.id as string, 10),
    );
    res.json({ success: true, variant });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/variants/:id',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: UpdateVariantSchema }),
  async (req, res, next) => {
    try {
      const variant = await CatalogService.updateVariant(
        req.user!.userId,
        parseInt(req.params.id as string, 10),
        req.body,
      );
      res.json({ variant });
    } catch (err) {
      next(err);
    }
  },
);

// --- Plans ---
// Customers can read active plans per SRS 2.1
router.get('/plans', requireAuth, async (req, res, next) => {
  try {
    const pagination = getPagination(req);
    const includeArchived = req.query.includeArchived === 'true' && req.user!.role === Role.ADMIN;
    const result = await CatalogService.listPlans(pagination, includeArchived);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/plans/:id', requireAuth, async (req, res, next) => {
  try {
    const plan = await CatalogService.getPlan(parseInt(req.params.id as string, 10));
    res.json({ plan });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/plans',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: CreatePlanSchema }),
  async (req, res, next) => {
    try {
      const plan = await CatalogService.createPlan(req.user!.userId, req.body);
      res.status(201).json({ plan });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/plans/:id/archive', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const plan = await CatalogService.archivePlan(
      req.user!.userId,
      parseInt(req.params.id as string, 10),
    );
    res.json({ success: true, plan });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/plans/:id',
  requireAuth,
  requireRole(Role.ADMIN),
  validate({ body: UpdatePlanSchema }),
  async (req, res, next) => {
    try {
      const plan = await CatalogService.updatePlan(
        req.user!.userId,
        parseInt(req.params.id as string, 10),
        req.body,
      );
      res.json({ plan });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/plans/:id/restore', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const plan = await CatalogService.restorePlan(
      req.user!.userId,
      parseInt(req.params.id as string, 10),
    );
    res.json({ success: true, plan });
  } catch (err) {
    next(err);
  }
});

export default router;

