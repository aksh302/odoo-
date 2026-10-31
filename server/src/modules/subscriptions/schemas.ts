import { z } from 'zod';
import { SubscriptionStatus } from '@prisma/client';

export const SubscriptionLineInputSchema = z.object({
  productId: z.number().int(),
  variantId: z.number().int().optional(),
  quantity: z.number().int().positive().default(1),
});

export const CreateSubscriptionSchema = z.object({
  customerId: z.number().int(),
  planId: z.number().int().optional(),
  templateId: z.number().int().optional(),
  startDate: z.string().transform((str) => new Date(str)),
  expiryDate: z.string().transform((str) => new Date(str)).optional(),
  paymentTerms: z.number().int().positive().default(15),
  lines: z.array(SubscriptionLineInputSchema).default([]),
});

export const TransitionSubscriptionSchema = z.object({
  status: z.nativeEnum(SubscriptionStatus),
  reason: z.string().optional(),
});


export const UpdateSubscriptionSchema = z.object({
  customerId: z.number().int().optional(),
  planId: z.number().int().optional(),
  startDate: z.string().transform((str) => new Date(str)).optional(),
  expiryDate: z.string().transform((str) => new Date(str)).optional(),
  paymentTerms: z.number().int().positive().optional(),
  lines: z.array(SubscriptionLineInputSchema).optional(),
});
