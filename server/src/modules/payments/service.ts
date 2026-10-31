import prisma from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { todayIST } from '../../lib/dates';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PaginationParams, paginate } from '../../lib/pagination';

export class PaymentService {
  /**
   * Paged payments, newest first, each with invoiceNumber and customerName.
   * Filters: invoiceId, customerId, from/to (payment date), q (invoice no., customer, reference),
   * includeVoided (default true; the portal passes false).
   */
  static async listPayments(
    pagination: PaginationParams,
    filters: {
      invoiceId?: number;
      customerId?: number;
      from?: Date;
      to?: Date;
      q?: string;
      includeVoided?: boolean;
    } = {},
  ) {
    const where: Prisma.PaymentWhereInput = { isSynthetic: false };
    if (filters.invoiceId) where.invoiceId = filters.invoiceId;
    if (filters.customerId) where.invoice = { customerId: filters.customerId };
    if (filters.from || filters.to) where.date = { gte: filters.from, lte: filters.to };
    if (filters.includeVoided === false) where.voidedAt = null;
    if (filters.q) {
      const q = filters.q.trim();
      where.OR = [
        { reference: { contains: q, mode: 'insensitive' } },
        { invoice: { number: { contains: q, mode: 'insensitive' } } },
        { invoice: { customer: { name: { contains: q, mode: 'insensitive' } } } },
        { invoice: { customer: { profile: { company: { contains: q, mode: 'insensitive' } } } } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true,
              number: true,
              customerId: true,
              total: true,
              customer: { select: { name: true, profile: { select: { company: true } } } },
            },
          },
        },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
      prisma.payment.count({ where }),
    ]);

    const data = rows.map(({ invoice, ...p }) => ({
      ...p,
      invoiceNumber: invoice.number,
      customerId: invoice.customerId,
      customerName: invoice.customer.profile?.company || invoice.customer.name,
    }));
    return paginate(data, total, pagination);
  }

  /**
   * Record a payment against an invoice.
   * Mandates:
   * - Must run in transaction
   * - Row lock on Invoice (SELECT ... FOR UPDATE)
   * - Verify amountPaid + payment <= total
   * - Auto-transition invoice to PAID when fully covered
   */
  static async recordPayment(
    actorId: number,
    data: {
      invoiceId: number;
      method: PaymentMethod;
      amount: number;
      date?: Date;
      reference?: string;
      note?: string;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      // Row lock on invoice via raw query where supported
      try {
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${data.invoiceId} FOR UPDATE`;
      } catch {
        // Mock / non-postgres fallback
      }

      const inv = await tx.invoice.findUnique({
        where: { id: data.invoiceId },
      });

      if (!inv || inv.isSynthetic) {
        throw Errors.notFound('Invoice', data.invoiceId);
      }

      if (inv.status === InvoiceStatus.DRAFT || inv.status === InvoiceStatus.CANCELLED) {
        throw Errors.conflict(`Cannot pay invoice in status ${inv.status}`);
      }

      const outstanding = inv.total - inv.amountPaid;
      if (data.amount > outstanding) {
        throw Errors.paymentExceedsOutstanding();
      }

      const paymentDate = data.date || todayIST();
      if (paymentDate > todayIST()) {
        throw Errors.validationError({ date: 'Payment date cannot be in the future' });
      }

      const payment = await tx.payment.create({
        data: {
          invoiceId: inv.id,
          method: data.method,
          amount: data.amount,
          date: paymentDate,
          reference: data.reference,
          note: data.note,
          createdBy: actorId,
          isSynthetic: false,
        },
      });

      const newAmountPaid = inv.amountPaid + data.amount;
      const targetStatus = newAmountPaid === inv.total ? InvoiceStatus.PAID : inv.status;

      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          amountPaid: newAmountPaid,
          status: targetStatus,
        },
      });

      await audit({
        userId: actorId,
        action: 'PAYMENT_CREATE',
        entity: 'Payment',
        entityId: payment.id,
        newValue: {
          amount: payment.amount,
          invoiceId: inv.id,
          invoiceStatus: targetStatus,
        },
      });

      return payment;
    });
  }

  /**
   * Void a payment (Admin only).
   * Mandates:
   * - Row lock on invoice
   * - Reduce invoice amountPaid
   * - If invoice was PAID, revert status to CONFIRMED
   */
  static async voidPayment(actorId: number, paymentId: number, reason: string) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { invoice: true },
      });

      if (!payment || payment.isSynthetic) {
        throw Errors.notFound('Payment', paymentId);
      }

      if (payment.voidedAt) {
        throw Errors.conflict('Payment is already voided');
      }

      const inv = payment.invoice;
      try {
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${inv.id} FOR UPDATE`;
      } catch {
        // Fallback
      }

      const updatedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          voidedAt: new Date(),
          voidReason: reason,
        },
      });

      const newAmountPaid = Math.max(0, inv.amountPaid - payment.amount);
      const newStatus = inv.status === InvoiceStatus.PAID ? InvoiceStatus.CONFIRMED : inv.status;

      await tx.invoice.update({
        where: { id: inv.id },
        data: {
          amountPaid: newAmountPaid,
          status: newStatus,
        },
      });

      await audit({
        userId: actorId,
        action: 'PAYMENT_VOID',
        entity: 'Payment',
        entityId: paymentId,
        newValue: { voidReason: reason, invoiceStatus: newStatus },
      });

      return updatedPayment;
    });
  }
}

