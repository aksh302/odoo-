import prisma from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { PaginationParams, paginate } from '../../lib/pagination';

export class QuotationService {
  static async listTemplates(pagination: PaginationParams) {
    const [data, total] = await Promise.all([
      prisma.quotationTemplate.findMany({
        include: {
          plan: true,
          lines: true,
        },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { id: 'desc' },
      }),
      prisma.quotationTemplate.count(),
    ]);
    return paginate(data, total, pagination);
  }

  static async getTemplate(templateId: number) {
    const template = await prisma.quotationTemplate.findUnique({
      where: { id: templateId },
      include: {
        plan: true,
        lines: true,
      },
    });
    if (!template) throw Errors.notFound('QuotationTemplate', templateId);
    return template;
  }

  static async createTemplate(
    actorId: number,
    data: {
      name: string;
      planId: number;
      validityDays: number;
      lines: Array<{ productId: number; variantId?: number; quantity: number }>;
    },
  ) {
    const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
    if (!plan || plan.isArchived) throw Errors.planArchived();

    const template = await prisma.quotationTemplate.create({
      data: {
        name: data.name,
        planId: data.planId,
        validityDays: data.validityDays,
        lines: {
          create: data.lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            quantity: l.quantity,
          })),
        },
      },
      include: { lines: true, plan: true },
    });

    await audit({
      userId: actorId,
      action: 'TEMPLATE_CREATE',
      entity: 'QuotationTemplate',
      entityId: template.id,
      newValue: data,
    });

    return template;
  }

  /** Edit a template. When `lines` is given it replaces all existing lines. */
  static async updateTemplate(
    actorId: number,
    templateId: number,
    data: {
      name?: string;
      planId?: number;
      validityDays?: number;
      lines?: Array<{ productId: number; variantId?: number; quantity: number }>;
    },
  ) {
    const existing = await prisma.quotationTemplate.findUnique({
      where: { id: templateId },
      include: { lines: true },
    });
    if (!existing) throw Errors.notFound('QuotationTemplate', templateId);

    if (data.planId && data.planId !== existing.planId) {
      const plan = await prisma.plan.findUnique({ where: { id: data.planId } });
      if (!plan || plan.isArchived) throw Errors.planArchived();
    }

    const template = await prisma.$transaction(async (tx) => {
      if (data.lines) {
        await tx.templateLine.deleteMany({ where: { templateId } });
      }
      return tx.quotationTemplate.update({
        where: { id: templateId },
        data: {
          name: data.name,
          planId: data.planId,
          validityDays: data.validityDays,
          lines: data.lines
            ? {
                create: data.lines.map((l) => ({
                  productId: l.productId,
                  variantId: l.variantId,
                  quantity: l.quantity,
                })),
              }
            : undefined,
        },
        include: { lines: true, plan: true },
      });
    });

    await audit({
      userId: actorId,
      action: 'TEMPLATE_UPDATE',
      entity: 'QuotationTemplate',
      entityId: templateId,
      oldValue: existing,
      newValue: data,
    });

    return template;
  }
}
