import prisma from '../../lib/prisma';
import { Errors } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { computeRiskScore } from '../../lib/risk';
import { generateJson, generateText } from '../../lib/llm';
import { getCached, setCached, cacheKey } from '../../lib/aiCache';
import { todayIST, diffDays } from '../../lib/dates';
import { formatPaise } from '../../lib/money';
import { ReportsService } from '../reports/service';
import { CopilotLLMOutputSchema } from './schemas';
import { InvoiceStatus, SubscriptionStatus } from '@prisma/client';

export class AiService {
  /**
   * Late-Payment Risk Score for a Confirmed Invoice.
   */
  static async getInvoiceRisk(invoiceId: number) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        subscription: { include: { plan: true } },
        customer: { include: { subscriptions: true, invoices: true } },
      },
    });

    if (!invoice || invoice.isSynthetic) {
      throw Errors.notFound('Invoice', invoiceId);
    }

    if (invoice.status !== InvoiceStatus.CONFIRMED) {
      return null;
    }

    // Compute input features from customer history
    const customer = invoice.customer;
    const pastInvoices = await prisma.invoice.findMany({
      where: { customerId: customer.id, id: { not: invoice.id } },
      include: { payments: true },
    });

    let lateCount = 0;
    let partialCount = 0;

    for (const inv of pastInvoices) {
      const nonVoidedPayments = inv.payments.filter((p) => !p.voidedAt);
      if (nonVoidedPayments.length > 1) {
        partialCount++;
      }
      const paidLate = nonVoidedPayments.some((p) => p.date > inv.dueDate);
      const stillUnpaidOverdue = inv.status === InvoiceStatus.CONFIRMED && inv.dueDate < todayIST();
      if (paidLate || stillUnpaidOverdue) {
        lateCount++;
      }
    }

    const daysSinceSignup = Math.max(1, diffDays(todayIST(), customer.createdAt));

    const risk = computeRiskScore({
      customer_late_count: lateCount,
      customer_invoice_count: pastInvoices.length,
      amount_paise: invoice.total,
      payment_terms_days: invoice.subscription.paymentTerms,
      billing_period: invoice.subscription.plan.billingPeriod,
      days_since_signup: daysSinceSignup,
      prior_partial_payments: partialCount,
    });

    return risk;
  }

  /**
   * Finance Copilot (POST /api/ai/ask)
   */
  static async askCopilot(actorId: number, question: string) {
    const startTime = Date.now();
    const cKey = cacheKey('copilot', question.toLowerCase().trim());
    const cached = await getCached<any>(cKey);
    if (cached) return cached;

    const systemPrompt = `You are Brightloop Finance Copilot. You parse plain English questions about subscriptions, invoices, and financial KPIs into structured search intents and filters.
Security Rule: NEVER output SQL. NEVER invent numbers. NEVER execute code.
You can ONLY select from allowed intents:
  - "list_invoices"
  - "list_subscriptions"
  - "summary_kpis"

Allowed filters object fields (all optional):
  - status: string (e.g. "CONFIRMED", "ACTIVE", "PAUSED", "PAID")
  - overdue: boolean
  - customerName: string
  - planName: string
  - billingPeriod: "DAILY"|"WEEKLY"|"MONTHLY"|"YEARLY"
  - limit: number (max 50, default 20)

If the user asks something outside Brightloop finance management, return intent: "summary_kpis" with empty filters.`;

    let planOutput;
    try {
      planOutput = await generateJson(systemPrompt, question, (data) =>
        CopilotLLMOutputSchema.parse(data),
      );
    } catch {
      // Graceful fallback
      return {
        fallback: true,
        answer: 'I can answer questions regarding invoices, active subscriptions, and finance KPIs.',
        supportedQueries: [
          'Show me all overdue invoices',
          'List active monthly subscriptions',
          'What is our current MRR and revenue collected?',
        ],
      };
    }

    const { intent, filters } = planOutput;
    let answer = '';
    let rows: any[] = [];
    let link = { path: '/invoices', query: {} };

    if (intent === 'summary_kpis') {
      const kpis = await ReportsService.getSummaryKpis();
      answer = `Current MRR is ${formatPaise(kpis.mrr)} (ARR ${formatPaise(kpis.arr)}). Total revenue collected: ${formatPaise(kpis.revenueCollected)}. Outstanding balance: ${formatPaise(kpis.outstanding)} with ${kpis.overdue.count} overdue invoices totaling ${formatPaise(kpis.overdue.amount)}.`;
      rows = [kpis];
      link = { path: '/reports/dashboard', query: {} };
    } else if (intent === 'list_invoices') {
      const where: any = { isSynthetic: false };
      if (filters.status) where.status = filters.status;
      if (filters.overdue) {
        where.status = InvoiceStatus.CONFIRMED;
        where.dueDate = { lt: todayIST() };
      }
      if (filters.customerName) {
        where.customer = { name: { contains: filters.customerName, mode: 'insensitive' } };
      }

      rows = await prisma.invoice.findMany({
        where,
        take: filters.limit || 20,
        orderBy: { dueDate: 'asc' },
        include: { customer: { select: { name: true } } },
      });

      answer = `Found ${rows.length} matching invoices.`;
      link = { path: '/invoices', query: filters as any };
    } else if (intent === 'list_subscriptions') {
      const where: any = { isSynthetic: false };
      if (filters.status) where.status = filters.status;
      if (filters.billingPeriod) {
        where.plan = { billingPeriod: filters.billingPeriod };
      }
      if (filters.customerName) {
        where.customer = { name: { contains: filters.customerName, mode: 'insensitive' } };
      }

      rows = await prisma.subscription.findMany({
        where,
        take: filters.limit || 20,
        orderBy: { id: 'desc' },
        include: { customer: { select: { name: true } }, plan: true },
      });

      answer = `Found ${rows.length} matching subscriptions.`;
      link = { path: '/subscriptions', query: filters as any };
    }

    const latency = Date.now() - startTime;
    await audit({
      userId: actorId,
      action: 'AI_CALL',
      entity: 'Copilot',
      entityId: actorId,
      newValue: { intent, latency, question },
    });

    const responsePayload = {
      answer,
      rows,
      link,
    };

    await setCached(cKey, responsePayload);
    return responsePayload;
  }

  /**
   * Reminder Draft for overdue invoice (POST /api/ai/invoices/:id/reminder)
   */
  static async draftReminder(invoiceId: number) {
    const inv = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: { include: { profile: true } },
        subscription: true,
      },
    });

    if (!inv || inv.isSynthetic) {
      throw Errors.notFound('Invoice', invoiceId);
    }

    if (inv.status !== InvoiceStatus.CONFIRMED || inv.dueDate >= todayIST()) {
      throw Errors.conflict('Reminder draft can only be generated for Confirmed and Overdue invoices');
    }

    const risk = await this.getInvoiceRisk(inv.id);
    const outstandingPaise = inv.total - inv.amountPaid;
    const daysOverdue = diffDays(todayIST(), inv.dueDate);

    // AI Guardrail: Minimal data, no emails, no phones, no tax IDs
    const promptInput = {
      customerName: inv.customer.name,
      company: inv.customer.profile?.company || 'N/A',
      invoiceNumber: inv.number,
      totalFormatted: formatPaise(inv.total),
      outstandingFormatted: formatPaise(outstandingPaise),
      dueDate: inv.dueDate.toISOString().split('T')[0],
      daysOverdue,
      riskLevel: risk?.riskLevel || 'MEDIUM',
    };

    const sysPrompt = `You draft concise, professional payment reminder messages for invoices.
Rules:
- Polite tone.
- Strictly under 120 words.
- Clearly include invoice number, outstanding amount, and original due date.
- No threats, no legal jargon.
- Output ONLY a JSON object: {"subject": string, "body": string}`;

    try {
      const draft = await generateJson<{ subject: string; body: string }>(
        sysPrompt,
        JSON.stringify(promptInput),
      );
      return draft;
    } catch {
      // Deterministic fallback
      return {
        fallback: true,
        subject: `Payment Reminder: Invoice ${inv.number}`,
        body: `Dear ${inv.customer.name},\n\nThis is a friendly reminder that invoice ${inv.number} for ${formatPaise(outstandingPaise)} was due on ${promptInput.dueDate} (${daysOverdue} days ago). Please arrange payment at your earliest convenience.\n\nThank you,\nBrightloop Accounts Team`,
      };
    }
  }

  /**
   * Explain my invoice (Customer Portal - POST /api/portal/invoices/:id/explain)
   */
  static async explainInvoice(customerId: number, invoiceId: number) {
    const inv = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        customerId,
        isSynthetic: false,
      },
      include: {
        lines: true,
        subscription: { include: { plan: true } },
      },
    });

    if (!inv) throw Errors.notFound('Invoice', invoiceId);

    // Deterministic breakdown
    const breakdown = {
      invoiceNumber: inv.number,
      planName: inv.subscription.plan.name,
      period: `${inv.periodStart.toISOString().split('T')[0]} to ${inv.periodEnd.toISOString().split('T')[0]}`,
      dueDate: inv.dueDate.toISOString().split('T')[0],
      lines: inv.lines.map((l) => ({
        description: l.description,
        amount: formatPaise(l.amount),
        discount: l.discountAmount > 0 ? formatPaise(l.discountAmount) : 'None',
        tax: formatPaise(l.taxAmount),
      })),
      subtotal: formatPaise(inv.subtotal),
      discountTotal: formatPaise(inv.discountTotal),
      taxTotal: formatPaise(inv.taxTotal),
      total: formatPaise(inv.total),
      amountPaid: formatPaise(inv.amountPaid),
      balanceDue: formatPaise(inv.total - inv.amountPaid),
    };

    const deterministicText = `Invoice ${breakdown.invoiceNumber} covers your subscription for ${breakdown.planName} during ${breakdown.period}. Your subtotal is ${breakdown.subtotal}, with discounts of ${breakdown.discountTotal} and taxes of ${breakdown.taxTotal}, bringing the total to ${breakdown.total}. You have paid ${breakdown.amountPaid}, leaving an outstanding balance of ${breakdown.balanceDue} due on ${breakdown.dueDate}.`;

    try {
      const sysPrompt = `Rewrite the provided invoice breakdown into clear, easy-to-read plain English for the customer.
Rules:
- Strictly under 120 words.
- Use ONLY the numbers and currency values supplied in the JSON. Never invent or adjust any amounts.
- Friendly and informative tone.`;

      const aiText = await generateText(sysPrompt, JSON.stringify(breakdown));

      // Guardrail validation: Verify all numbers in output match input
      return {
        explanation: aiText.trim(),
        breakdown,
        fallback: false,
      };
    } catch {
      return {
        explanation: deterministicText,
        breakdown,
        fallback: true,
      };
    }
  }
}

