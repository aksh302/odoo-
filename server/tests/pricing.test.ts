import { describe, it, expect, vi } from 'vitest';
import { PricingService } from '../src/modules/pricing/service';
import { DiscountScope, DiscountType } from '@prisma/client';
import prisma from '../src/lib/prisma';

vi.mock('../src/lib/prisma', () => {
  return {
    default: {
      discount: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
        fields: {
          usedCount: 'usedCount',
          usageLimit: 'usageLimit',
        },
      },
    },
  };
});

describe('Pricing & Discount Calculation (SRS 2.3, 9.4 / Phase 5)', () => {
  it('computes plan fee as independent line with 0 tax', async () => {
    (prisma.discount.findMany as any).mockResolvedValue([]);

    const plan = { id: 1, name: 'Starter Monthly', price: 99900 };
    const lines = [
      {
        productId: 10,
        description: 'CRM Standard',
        quantity: 1,
        unitPrice: 150000,
        taxPercent: 18,
      },
    ];

    const result = await PricingService.computePricing(plan, lines, new Date('2026-10-31'));

    expect(result.lines.length).toBe(2);
    // Line 1: Plan fee
    expect(result.lines[0].description).toBe('Plan fee - Starter Monthly');
    expect(result.lines[0].amount).toBe(99900);
    expect(result.lines[0].taxAmount).toBe(0);

    // Line 2: Product line
    expect(result.lines[1].amount).toBe(150000);
    expect(result.lines[1].taxAmount).toBe(27000); // 18% of 150000

    expect(result.subtotal).toBe(99900 + 150000);
    expect(result.taxTotal).toBe(27000);
    expect(result.total).toBe(99900 + 150000 + 27000);
  });

  it('selects highest value discount and avoids stacking', async () => {
    // 2 discounts available: 10% vs Flat 50000 paise (₹500)
    // On a line of 200,000 paise (₹2000):
    // 10% = 20,000 paise
    // Flat = 50,000 paise
    // Highest value wins -> Flat 50,000
    (prisma.discount.findMany as any).mockResolvedValue([
      {
        id: 1,
        name: '10% Off',
        type: DiscountType.PERCENT,
        value: 10,
        scope: DiscountScope.PRODUCT,
        products: [{ productId: 10 }],
      },
      {
        id: 2,
        name: '₹500 Off',
        type: DiscountType.FIXED,
        value: 50000,
        scope: DiscountScope.PRODUCT,
        products: [{ productId: 10 }],
      },
    ]);

    const plan = { id: 1, name: 'Pro', price: 0 };
    const lines = [
      {
        productId: 10,
        description: 'Product A',
        quantity: 1,
        unitPrice: 200000,
        taxPercent: 18,
      },
    ];

    const result = await PricingService.computePricing(plan, lines, new Date('2026-10-31'));
    const prodLine = result.lines[1];

    expect(prodLine.discountId).toBe(2);
    expect(prodLine.discountAmount).toBe(50000);
    // Tax after discount: (200000 - 50000) * 18% = 150000 * 18% = 27000
    expect(prodLine.taxAmount).toBe(27000);
    expect(prodLine.lineTotal).toBe(150000 + 27000);
  });
});

