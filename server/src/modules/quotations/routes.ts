import { Router } from 'express';
import { QuotationService } from './service';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { getPagination } from '../../lib/pagination';
import { Role } from '@prisma/client';
import { CreateTemplateSchema } from './schemas';

const router = Router();

// Staff & Admin can manage quotation templates per SRS 2.1
router.get('/', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const pagination = getPagination(req);
    const result = await QuotationService.listTemplates(pagination);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const template = await QuotationService.getTemplate(parseInt(req.params.id as string, 10));
    res.json({ template });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  validate({ body: CreateTemplateSchema }),
  async (req, res, next) => {
    try {
      const template = await QuotationService.createTemplate(req.user!.userId, req.body);
      res.status(201).json({ template });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

