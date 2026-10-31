import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

export const RecordPaymentSchema = z.object({
  invoiceId: z.number().int(),
  method: z.nativeEnum(PaymentMethod),
  amount: z.number().int().positive('Payment amount must be positive paise'),
  date: z.string().transform((str) => new Date(str)).optional(),
  reference: z.string().optional(),
  note: z.string().optional(),
});

export const VoidPaymentSchema = z.object({
  reason: z.string().min(1, 'Void reason is required'),
});

