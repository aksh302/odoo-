import { z } from 'zod';
import { BillingPeriod } from '@prisma/client';

export const CreateTaxSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  percent: z.number().min(0).max(100, 'Tax percentage must be between 0 and 100'),
});

export const CreateProductSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  salesPrice: z.number().int().nonnegative('Sales price must be positive integer paise'),
  costPrice: z.number().int().nonnegative('Cost price must be positive integer paise'),
  notes: z.string().optional(),
  taxId: z.number().int().optional(),
});

export const UpdateProductSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  salesPrice: z.number().int().nonnegative().optional(),
  costPrice: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
  taxId: z.number().int().nullable().optional(),
});

export const CreateVariantSchema = z.object({
  productId: z.number().int(),
  attribute: z.string().min(1, 'Attribute is required (e.g. Edition)'),
  value: z.string().min(1, 'Value is required (e.g. Enterprise)'),
  extraPrice: z.number().int().default(0), // paise
});

export const UpdateVariantSchema = z.object({
  attribute: z.string().min(1).optional(),
  value: z.string().min(1).optional(),
  extraPrice: z.number().int().optional(),
});

export const CreatePlanSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  price: z.number().int().nonnegative('Price must be positive integer paise'),
  billingPeriod: z.nativeEnum(BillingPeriod),
  minQty: z.number().int().positive().default(1),
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
  autoClose: z.boolean().default(false),
  closable: z.boolean().default(true),
  pausable: z.boolean().default(true),
  renewable: z.boolean().default(true),
}).refine((data) => data.endDate > data.startDate, {
  message: 'endDate must be after startDate',
  path: ['endDate'],
});

export const UpdatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().int().nonnegative().optional(),
  minQty: z.number().int().positive().optional(),
  startDate: z.string().transform((str) => new Date(str)).optional(),
  endDate: z.string().transform((str) => new Date(str)).optional(),
  autoClose: z.boolean().optional(),
  closable: z.boolean().optional(),
  pausable: z.boolean().optional(),
  renewable: z.boolean().optional(),
});

