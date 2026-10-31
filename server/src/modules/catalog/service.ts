import prisma from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { PaginationParams, paginate, PaginatedResponse } from '../../lib/pagination';

export class CatalogService {
  // Taxes
  static async listTaxes() {
    return prisma.tax.findMany({ orderBy: { id: 'asc' } });
  }

  static async createTax(actorId: number, data: { name: string; percent: number }) {
    const tax = await prisma.tax.create({
      data: {
        name: data.name,
        percent: data.percent,
      },
    });
    await audit({
      userId: actorId,
      action: 'TAX_CREATE',
      entity: 'Tax',
      entityId: tax.id,
      newValue: data,
    });
    return tax;
  }

  static async updateTax(actorId: number, taxId: number, data: { name?: string; percent?: number }) {
    const existing = await prisma.tax.findUnique({ where: { id: taxId } });
    if (!existing) throw Errors.notFound('Tax', taxId);

    const updated = await prisma.tax.update({ where: { id: taxId }, data });
    await audit({
      userId: actorId,
      action: 'TAX_UPDATE',
      entity: 'Tax',
      entityId: taxId,
      oldValue: existing,
      newValue: updated,
    });
    return updated;
  }

  // Products
  static async listProducts(
    pagination: PaginationParams,
    includeArchived = false,
  ): Promise<PaginatedResponse<any>> {
    const where = includeArchived ? {} : { isArchived: false };
    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          tax: true,
          variants: { where: includeArchived ? {} : { isArchived: false } },
        },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { id: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  static async getProduct(productId: number) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { tax: true, variants: true },
    });
    if (!product) throw Errors.notFound('Product', productId);
    return product;
  }

  static async createProduct(
    actorId: number,
    data: {
      name: string;
      type: string;
      salesPrice: number;
      costPrice: number;
      notes?: string;
      taxId?: number;
    },
  ) {
    const product = await prisma.product.create({
      data: {
        name: data.name,
        type: data.type,
        salesPrice: data.salesPrice,
        costPrice: data.costPrice,
        notes: data.notes,
        taxId: data.taxId,
      },
      include: { tax: true },
    });

    await audit({
      userId: actorId,
      action: 'PRODUCT_CREATE',
      entity: 'Product',
      entityId: product.id,
      newValue: data,
    });

    return product;
  }

  static async updateProduct(
    actorId: number,
    productId: number,
    data: {
      name?: string;
      type?: string;
      salesPrice?: number;
      costPrice?: number;
      notes?: string;
      taxId?: number | null;
    },
  ) {
    const existing = await prisma.product.findUnique({ where: { id: productId } });
    if (!existing) throw Errors.notFound('Product', productId);

    const updated = await prisma.product.update({
      where: { id: productId },
      data,
      include: { tax: true, variants: true },
    });

    await audit({
      userId: actorId,
      action: 'PRODUCT_UPDATE',
      entity: 'Product',
      entityId: productId,
      oldValue: existing,
      newValue: updated,
    });

    return updated;
  }

  static async archiveProduct(actorId: number, productId: number) {
    const existing = await prisma.product.findUnique({ where: { id: productId } });
    if (!existing) throw Errors.notFound('Product', productId);

    const updated = await prisma.product.update({
      where: { id: productId },
      data: { isArchived: true },
    });

    await audit({
      userId: actorId,
      action: 'PRODUCT_ARCHIVE',
      entity: 'Product',
      entityId: productId,
      newValue: { isArchived: true },
    });

    return updated;
  }

  static async restoreProduct(actorId: number, productId: number) {
    const existing = await prisma.product.findUnique({ where: { id: productId } });
    if (!existing) throw Errors.notFound('Product', productId);

    const updated = await prisma.product.update({
      where: { id: productId },
      data: { isArchived: false },
      include: { tax: true, variants: true },
    });

    await audit({
      userId: actorId,
      action: 'PRODUCT_RESTORE',
      entity: 'Product',
      entityId: productId,
      newValue: { isArchived: false },
    });

    return updated;
  }

  // Variants
  static async createVariant(
    actorId: number,
    data: {
      productId: number;
      attribute: string;
      value: string;
      extraPrice: number;
    },
  ) {
    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product || product.isArchived) throw Errors.notFound('Active Product', data.productId);

    const variant = await prisma.variant.create({
      data: {
        productId: data.productId,
        attribute: data.attribute,
        value: data.value,
        extraPrice: data.extraPrice,
      },
    });

    await audit({
      userId: actorId,
      action: 'VARIANT_CREATE',
      entity: 'Variant',
      entityId: variant.id,
      newValue: data,
    });

    return variant;
  }

  static async archiveVariant(actorId: number, variantId: number) {
    const existing = await prisma.variant.findUnique({ where: { id: variantId } });
    if (!existing) throw Errors.notFound('Variant', variantId);

    const updated = await prisma.variant.update({
      where: { id: variantId },
      data: { isArchived: true },
    });

    await audit({
      userId: actorId,
      action: 'VARIANT_ARCHIVE',
      entity: 'Variant',
      entityId: variantId,
      newValue: { isArchived: true },
    });

    return updated;
  }

  static async updateVariant(
    actorId: number,
    variantId: number,
    data: { attribute?: string; value?: string; extraPrice?: number },
  ) {
    const existing = await prisma.variant.findUnique({ where: { id: variantId } });
    if (!existing) throw Errors.notFound('Variant', variantId);

    const updated = await prisma.variant.update({ where: { id: variantId }, data });
    await audit({
      userId: actorId,
      action: 'VARIANT_UPDATE',
      entity: 'Variant',
      entityId: variantId,
      oldValue: existing,
      newValue: updated,
    });
    return updated;
  }

  // Plans
  static async listPlans(pagination: PaginationParams, includeArchived = false) {
    const where = includeArchived ? {} : { isArchived: false };
    const [data, total] = await Promise.all([
      prisma.plan.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { id: 'desc' },
      }),
      prisma.plan.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  static async getPlan(planId: number) {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw Errors.notFound('Plan', planId);
    return plan;
  }

  static async createPlan(actorId: number, data: any) {
    const plan = await prisma.plan.create({ data });
    await audit({
      userId: actorId,
      action: 'PLAN_CREATE',
      entity: 'Plan',
      entityId: plan.id,
      newValue: data,
    });
    return plan;
  }

  static async archivePlan(actorId: number, planId: number) {
    const existing = await prisma.plan.findUnique({ where: { id: planId } });
    if (!existing) throw Errors.notFound('Plan', planId);

    const updated = await prisma.plan.update({
      where: { id: planId },
      data: { isArchived: true },
    });

    await audit({
      userId: actorId,
      action: 'PLAN_ARCHIVE',
      entity: 'Plan',
      entityId: planId,
      newValue: { isArchived: true },
    });

    return updated;
  }

  static async updatePlan(actorId: number, planId: number, data: any) {
    const existing = await prisma.plan.findUnique({ where: { id: planId } });
    if (!existing) throw Errors.notFound('Plan', planId);

    const startDate = data.startDate ?? existing.startDate;
    const endDate = data.endDate ?? existing.endDate;
    if (endDate <= startDate) {
      throw Errors.validationError({ endDate: 'endDate must be after startDate' });
    }

    const updated = await prisma.plan.update({ where: { id: planId }, data });
    await audit({
      userId: actorId,
      action: 'PLAN_UPDATE',
      entity: 'Plan',
      entityId: planId,
      oldValue: existing,
      newValue: updated,
    });
    return updated;
  }

  static async restorePlan(actorId: number, planId: number) {
    const existing = await prisma.plan.findUnique({ where: { id: planId } });
    if (!existing) throw Errors.notFound('Plan', planId);

    const updated = await prisma.plan.update({
      where: { id: planId },
      data: { isArchived: false },
    });

    await audit({
      userId: actorId,
      action: 'PLAN_RESTORE',
      entity: 'Plan',
      entityId: planId,
      newValue: { isArchived: false },
    });

    return updated;
  }
}
