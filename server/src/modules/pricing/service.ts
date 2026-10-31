import prisma from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { lineAmount, calcDiscount, calcTax } from '../../lib/money';
import { DiscountType, DiscountScope } from '@prisma/client';
import { PaginationParams, paginate } from '../../lib/pagination';

export interface EvaluatedLinePrice {
  productId?: number | null;
  variantId?: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  discountId?: number | null;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  lineTotal: number;
}

export interface EvaluatedPricingResult {
  lines: EvaluatedLinePrice[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
}

export class PricingService {
  static async listDiscounts(pagination: PaginationParams) {
    const [data, total] = await Promise.all([
      prisma.discount.findMany({
        include: { products: true },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { id: 'desc' },
      }),
      prisma.discount.count(),
    ]);
    return paginate(data, total, pagination);
  }

  static async createDiscount(actorId: number, data: any) {
    const { productIds, ...rest } = data;
    const discount = await prisma.discount.create({
      data: {
        ...rest,
        products: {
          create: productIds.map((pid: number) => ({ productId: pid })),
        },
      },
      include: { products: true },
    });

    await audit({
      userId: actorId,
      action: 'DISCOUNT_CREATE',
      entity: 'Discount',
      entityId: discount.id,
      newValue: data,
    });

    return discount;
  }

  static async computePricing(
    plan: { id: number; name: string; price: number },
    lines: Array<{
      productId: number;
      variantId?: number | null;
      description: string;
      quantity: number;
      unitPrice: number;
      taxPercent?: number;
    }>,
    asOfDate: Date,
    prefetchedDiscounts?: any[],
  ): Promise<EvaluatedPricingResult> {
    let discounts: any[];
    if (prefetchedDiscounts) {
      discounts = prefetchedDiscounts;
    } else {
      // 1. Fetch all active discounts valid as of asOfDate
      const allDiscounts = await prisma.discount.findMany({
        where: {
          isActive: true,
          startDate: { lte: asOfDate },
          endDate: { gte: asOfDate },
        },
        include: { products: true },
      });

      // In-memory filter for usageLimit (avoids Prisma column-to-column comparison limitations)
      discounts = allDiscounts.filter(
        (d) => d.usageLimit === null || d.usedCount < d.usageLimit,
      );
    }

    const evaluatedLines: EvaluatedLinePrice[] = [];

    // Line 1: Plan fee (description: "Plan fee - <plan name>", qty 1, no tax)
    evaluatedLines.push({
      productId: null,
      variantId: null,
      description: `Plan fee - ${plan.name}`,
      quantity: 1,
      unitPrice: plan.price,
      amount: plan.price,
      discountId: null,
      discountAmount: 0,
      taxPercent: 0,
      taxAmount: 0,
      lineTotal: plan.price,
    });

    // Evaluate each subscription line
    for (const line of lines) {
      const baseAmount = lineAmount(line.quantity, line.unitPrice);

      // Candidate discounts matching this line
      const candidates = discounts.filter((d) => {
        if (d.scope === DiscountScope.PRODUCT) {
          const linksToProduct = d.products.some((p) => p.productId === line.productId);
          if (!linksToProduct) return false;
        }
        // PRODUCT scope applies minQty to the line quantity; SUBSCRIPTION scope checks total subscription quantity
        if (d.minQty) {
          const evalQty = d.scope === DiscountScope.PRODUCT 
            ? line.quantity 
            : lines.reduce((acc, l) => acc + l.quantity, 0);
          if (evalQty < d.minQty) return false;
        }
        // minPurchase check: PRODUCT scope checks line base amount; SUBSCRIPTION scope checks subscription recurring subtotal
        if (d.minPurchase) {
          const evalAmount = d.scope === DiscountScope.PRODUCT 
            ? baseAmount 
            : (plan.price + lines.reduce((acc, l) => acc + (l.quantity * l.unitPrice), 0));
          if (evalAmount < d.minPurchase) return false;
        }
        return true;
      });

      // SRS: "One discount per line, highest value wins; no stacking"
      let bestDiscountId: number | null = null;
      let maxDiscountVal = 0;

      for (const d of candidates) {
        const discVal = calcDiscount(baseAmount, d.type, d.value);
        if (discVal > maxDiscountVal) {
          maxDiscountVal = discVal;
          bestDiscountId = d.id;
        }
      }

      const amountAfterDiscount = baseAmount - maxDiscountVal;
      const taxPercent = line.taxPercent || 0;
      const taxAmount = calcTax(amountAfterDiscount, taxPercent);
      const lineTotal = amountAfterDiscount + taxAmount;

      evaluatedLines.push({
        productId: line.productId,
        variantId: line.variantId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: baseAmount,
        discountId: bestDiscountId,
        discountAmount: maxDiscountVal,
        taxPercent,
        taxAmount,
        lineTotal,
      });
    }

    const subtotal = evaluatedLines.reduce((acc, l) => acc + l.amount, 0);
    const discountTotal = evaluatedLines.reduce((acc, l) => acc + l.discountAmount, 0);
    const taxTotal = evaluatedLines.reduce((acc, l) => acc + l.taxAmount, 0);
    const total = subtotal - discountTotal + taxTotal;

    return {
      lines: evaluatedLines,
      subtotal,
      discountTotal,
      taxTotal,
      total,
    };
  }

  static async claimDiscountUsageTx(tx: any, discountId: number): Promise<void> {
    // Atomic check and increment
    const updated = await tx.discount.updateMany({
      where: {
        id: discountId,
        OR: [
          { usageLimit: null },
          { usedCount: { lt: tx.discount.fields.usageLimit } },
        ],
      },
      data: {
        usedCount: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      throw Errors.discountExhausted();
    }
  }

  static async returnDiscountUsageTx(tx: any, discountId: number): Promise<void> {
    await tx.discount.update({
      where: { id: discountId },
      data: {
        usedCount: { decrement: 1 },
      },
    });
  }
}

