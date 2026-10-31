import { z } from 'zod';

export const TemplateLineSchema = z.object({
  productId: z.number().int(),
  variantId: z.number().int().optional(),
  quantity: z.number().int().positive(),
});

export const CreateTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  planId: z.number().int(),
  validityDays: z.number().int().positive().default(30),
  lines: z.array(TemplateLineSchema).min(1, 'Template must have at least one line'),
});


export const UpdateTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  planId: z.number().int().optional(),
  validityDays: z.number().int().positive().optional(),
  lines: z.array(TemplateLineSchema).min(1, 'Template must have at least one line').optional(),
});
