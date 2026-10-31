import { Router } from 'express';
import { AiService } from './service';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { aiLimiter } from '../../middleware/rateLimit';
import { Role } from '@prisma/client';
import { AskCopilotSchema } from './schemas';

const router = Router();

// Risk score for Confirmed invoice (Admin, Staff)
router.get('/invoices/:id/risk', requireAuth, requireRole(Role.ADMIN, Role.STAFF), async (req, res, next) => {
  try {
    const risk = await AiService.getInvoiceRisk(parseInt(req.params.id as string, 10));
    res.json({ risk });
  } catch (err) {
    next(err);
  }
});

// Finance Copilot (Admin, Staff)
router.post(
  '/ask',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  aiLimiter,
  validate({ body: AskCopilotSchema }),
  async (req, res, next) => {
    try {
      const result = await AiService.askCopilot(req.user!.userId, req.body.question);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// Reminder draft (Admin, Staff)
router.post(
  '/invoices/:id/reminder',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  aiLimiter,
  async (req, res, next) => {
    try {
      const draft = await AiService.draftReminder(parseInt(req.params.id as string, 10));
      res.json(draft);
    } catch (err) {
      next(err);
    }
  },
);

// Explain invoice (Customer portal only - own invoices)
router.post(
  '/portal/invoices/:id/explain',
  requireAuth,
  requireRole(Role.CUSTOMER),
  aiLimiter,
  async (req, res, next) => {
    try {
      const explanation = await AiService.explainInvoice(
        req.user!.customerId!,
        parseInt(req.params.id as string, 10),
      );
      res.json(explanation);
    } catch (err) {
      next(err);
    }
  },
);

export default router;

