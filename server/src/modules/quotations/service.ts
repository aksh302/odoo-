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
}

