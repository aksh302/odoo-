import { z } from 'zod';
import { InvoiceStatus } from '@prisma/client';

export const RunBillingSchema = z.object({
  asOf: z.string().transform((str) => new Date(str)).optional(),
});

export const BulkConfirmInvoiceSchema = z.object({
  invoiceIds: z.array(z.number().int()).min(1),
});

export const CancelInvoiceSchema = z.object({
  reason: z.string().min(1).optional(),
});

