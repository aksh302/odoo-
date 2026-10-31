import { z } from 'zod';
import { DiscountType, DiscountScope } from '@prisma/client';

export const CreateDiscountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.nativeEnum(DiscountType),
  value: z.number().int().nonnegative(),
  minPurchase: z.number().int().nonnegative().optional(),
  minQty: z.number().int().positive().optional(),
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
  usageLimit: z.number().int().positive().optional(),
  scope: z.nativeEnum(DiscountScope),
  productIds: z.array(z.number().int()).default([]),
}).refine((data) => {
  if (data.type === DiscountType.PERCENT) {
    return data.value >= 0 && data.value <= 100;
  }
  return true;
}, {
  message: 'Percentage discount must be between 0 and 100',
  path: ['value'],
}).refine((data) => data.endDate >= data.startDate, {
  message: 'endDate must be on or after startDate',
  path: ['endDate'],
});

