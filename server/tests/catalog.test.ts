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
      product: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      plan: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    },
  };
});

describe('Catalog & RBAC API (Phase 3)', () => {
  const staffToken = jwt.sign(
    { userId: 10, email: 'staff@test.com', role: Role.STAFF },
    config.jwt.secret,
  );

  const adminToken = jwt.sign(
    { userId: 1, email: 'admin@test.com', role: Role.ADMIN },
    config.jwt.secret,
  );

  it('allows staff to read products', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 10,
      email: 'staff@test.com',
      role: Role.STAFF,
      isActive: true,
    });
    (prisma.product.findMany as any).mockResolvedValue([]);
    (prisma.product.count as any).mockResolvedValue(0);

    const res = await request(app)
      .get('/api/catalog/products')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('blocks staff from creating products (Admin only)', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 10,
      email: 'staff@test.com',
      role: Role.STAFF,
      isActive: true,
    });

    const res = await request(app)
      .post('/api/catalog/products')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        name: 'CRM Pro',
        type: 'software',
        salesPrice: 150000,
        costPrice: 50000,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows admin to create products', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 1,
      email: 'admin@test.com',
      role: Role.ADMIN,
      isActive: true,
    });
    (prisma.product.create as any).mockResolvedValue({
      id: 101,
      name: 'CRM Pro',
      salesPrice: 150000,
      costPrice: 50000,
    });

    const res = await request(app)
      .post('/api/catalog/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'CRM Pro',
        type: 'software',
        salesPrice: 150000,
        costPrice: 50000,
      });

    expect(res.status).toBe(201);
    expect(res.body.product.id).toBe(101);
  });
});

