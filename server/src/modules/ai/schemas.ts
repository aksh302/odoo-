import { z } from 'zod';
import { BillingPeriod, InvoiceStatus, SubscriptionStatus } from '@prisma/client';

export const AskCopilotSchema = z.object({
  question: z.string().min(1, 'Question is required'),
});

export const AllowedIntents = z.enum(['list_invoices', 'list_subscriptions', 'summary_kpis']);

export const CopilotFiltersSchema = z.object({
  status: z.string().optional(),
  overdue: z.boolean().optional(),
  customerName: z.string().optional(),
  planName: z.string().optional(),
  billingPeriod: z.nativeEnum(BillingPeriod).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  minDaysOverdue: z.number().int().optional(),
  limit: z.number().int().max(50).default(20),
});

export const CopilotLLMOutputSchema = z.object({
  intent: AllowedIntents,
  filters: CopilotFiltersSchema,
  rationale: z.string().optional(),
});

