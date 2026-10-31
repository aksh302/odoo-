import { Router } from 'express';
import prisma from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { generateInvoicePdfBuffer } from './pdf';
import { sendEmail } from '../../lib/mailer';
import { Role } from '@prisma/client';

const router = Router();

// Stream PDF invoice
router.get('/:id/pdf', requireAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { lines: true, customer: true },
    });

    if (!invoice || invoice.isSynthetic) {
      throw Errors.notFound('Invoice', id);
    }

    // Portal check: if customer, must own the invoice
    if (req.user!.role === Role.CUSTOMER && invoice.customerId !== req.user!.customerId) {
      throw Errors.notFound('Invoice', id);
    }

    const pdfBuffer = await generateInvoicePdfBuffer({
      number: invoice.number,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      dueDate: invoice.dueDate,
      subtotal: invoice.subtotal,
      discountTotal: invoice.discountTotal,
      taxTotal: invoice.taxTotal,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      status: invoice.status,
      customerSnapshot: invoice.customerSnapshot,
      lines: invoice.lines,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// Send invoice via email (Staff, Admin)
// Accepts optional { subject, body } so staff can edit AI reminder draft before sending
router.post(
  '/:id/send',
  requireAuth,
  requireRole(Role.ADMIN, Role.STAFF),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: { lines: true, customer: true },
      });

      if (!invoice || invoice.isSynthetic) {
        throw Errors.notFound('Invoice', id);
      }

      const pdfBuffer = await generateInvoicePdfBuffer({
        number: invoice.number,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        dueDate: invoice.dueDate,
        subtotal: invoice.subtotal,
        discountTotal: invoice.discountTotal,
        taxTotal: invoice.taxTotal,
        total: invoice.total,
        amountPaid: invoice.amountPaid,
        status: invoice.status,
        customerSnapshot: invoice.customerSnapshot,
        lines: invoice.lines,
      });

      const subject = req.body?.subject || `Invoice ${invoice.number} from Brightloop`;
      const bodyHtml = req.body?.body
        ? `<p>${req.body.body.replace(/\n/g, '<br/>')}</p>`
        : `<p>Dear ${invoice.customer.name},</p><p>Please find attached your invoice <b>${invoice.number}</b>.</p>`;

      const sent = await sendEmail({
        to: invoice.customer.email,
        subject,
        html: bodyHtml,
        attachments: [
          {
            filename: `${invoice.number}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });

      if (!sent) {
        return res.status(502).json({
          error: {
            code: 'EMAIL_SEND_FAILED',
            message: 'Failed to dispatch email to customer; invoice remains unchanged',
          },
        });
      }

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { emailedAt: new Date() },
      });

      res.json({ success: true, emailedAt: new Date() });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

