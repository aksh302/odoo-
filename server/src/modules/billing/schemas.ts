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


export const ListInvoicesQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  customerId: z.coerce.number().int().optional(),
  subscriptionId: z.coerce.number().int().optional(),
  overdue: z.enum(['true', 'false']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().optional(),
});

export const ConfirmDraftsSchema = z.object({
  /** leave out to confirm every draft */
  invoiceIds: z.array(z.number().int()).optional(),
});

export const RemindSchema = z.object({
  channel: z.enum(['EMAIL', 'WHATSAPP']).default('EMAIL'),
});
