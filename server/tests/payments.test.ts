import { describe, it, expect, vi } from 'vitest';
import { PaymentService } from '../src/modules/payments/service';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';
import prisma from '../src/lib/prisma';

vi.mock('../src/lib/prisma', () => {
  const mockTx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    invoice: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  return {
    default: {
      $transaction: vi.fn(async (cb) => cb(mockTx)),
      payment: mockTx.payment,
      invoice: mockTx.invoice,
      auditLog: mockTx.auditLog,
      mockTx,
    },
  };
});

describe('Payments & Invoices Lifecycle (SRS 2.2, FR-7 / Phase 6)', () => {
  it('rejects payment if amount exceeds outstanding', async () => {
    const mockTx = (prisma as any).mockTx;
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 1,
      total: 100000,
      amountPaid: 80000,
      status: InvoiceStatus.CONFIRMED,
      isSynthetic: false,
    });

    await expect(
      PaymentService.recordPayment(1, {
        invoiceId: 1,
        method: PaymentMethod.UPI,
        amount: 30000, // outstanding is 20000
      }),
    ).rejects.toThrowError(/Payment amount exceeds outstanding balance/);
  });

  it('auto-transitions invoice to PAID when payment fully covers total', async () => {
    const mockTx = (prisma as any).mockTx;
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 2,
      total: 100000,
      amountPaid: 60000,
      status: InvoiceStatus.CONFIRMED,
      isSynthetic: false,
    });

    mockTx.payment.create.mockResolvedValue({
      id: 10,
      amount: 40000,
    });

    await PaymentService.recordPayment(1, {
      invoiceId: 2,
      method: PaymentMethod.BANK_TRANSFER,
      amount: 40000,
    });

    expect(mockTx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 2 },
        data: {
          amountPaid: 100000,
          status: InvoiceStatus.PAID,
        },
      }),
    );
  });
});

