import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => {
  return {
    default: {
      user: {
        findUnique: vi.fn(),
      },
      invoice: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      subscription: {
        findMany: vi.fn(),
      },
      payment: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 500000 } }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      aiCache: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
    },
  };
});

describe('AI Features & Guardrails (Phase 9 / SRS Section 7)', () => {
  const staffToken = jwt.sign(
    { userId: 5, email: 'staff@test.com', role: Role.STAFF },
    config.jwt.secret,
  );

  const customerToken = jwt.sign(
    { userId: 44, email: 'cust@test.com', role: Role.CUSTOMER },
    config.jwt.secret,
  );

  it('blocks customer from accessing Finance Copilot (/api/ai/ask)', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 44,
      email: 'cust@test.com',
      role: Role.CUSTOMER,
      isActive: true,
    });

    const res = await request(app)
      .post('/api/ai/ask')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ question: 'How much MRR do we have?' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses reminder draft for non-overdue invoice', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 5,
      email: 'staff@test.com',
      role: Role.STAFF,
      isActive: true,
    });

    (prisma.invoice.findUnique as any).mockResolvedValue({
      id: 77,
      status: 'CONFIRMED',
      dueDate: new Date(Date.now() + 86400000 * 5), // Future due date
      isSynthetic: false,
    });

    const res = await request(app)
      .post('/api/ai/invoices/77/reminder')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('Confirmed and Overdue');
  });

  it('blocks customer from explaining another customer invoice (returns 404)', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 44,
      email: 'cust@test.com',
      role: Role.CUSTOMER,
      isActive: true,
    });

    // Customer 44 attempting to access invoice belonging to customer 99
    (prisma.invoice.findFirst as any).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/ai/portal/invoices/123/explain')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

