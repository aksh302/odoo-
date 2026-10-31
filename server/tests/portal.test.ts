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
    },
  };
});

describe('Portal & PDF Isolation (SRS 1.4, FR-7 / Phase 7)', () => {
  const customer1Token = jwt.sign(
    { userId: 101, email: 'customer1@test.com', role: Role.CUSTOMER },
    config.jwt.secret,
  );

  it('returns 404 when customer attempts to access another customer invoice', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 101,
      email: 'customer1@test.com',
      role: Role.CUSTOMER,
      isActive: true,
    });

    // Invoice belongs to customer 202
    (prisma.invoice.findFirst as any).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/portal/invoices/999')
      .set('Authorization', `Bearer ${customer1Token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 on PDF download when customer does not own the invoice', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 101,
      email: 'customer1@test.com',
      role: Role.CUSTOMER,
      isActive: true,
    });

    (prisma.invoice.findUnique as any).mockResolvedValue({
      id: 888,
      customerId: 999, // Different owner
      isSynthetic: false,
    });

    const res = await request(app)
      .get('/api/documents/888/pdf')
      .set('Authorization', `Bearer ${customer1Token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

