import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { config } from '../src/config';
import bcrypt from 'bcrypt';

describe('Reports & Aggregates Real DB (SRS 2.4 / FR-8)', () => {
  let adminToken: string;

  beforeAll(async () => {
    const hash = await bcrypt.hash('Test@123', 8);

    const admin = await prisma.user.create({
      data: {
        name: 'Report Admin',
        email: `report_admin_${Date.now()}@test.com`,
        passwordHash: hash,
        role: Role.ADMIN,
      },
    });
    adminToken = jwt.sign(
      { userId: admin.id, email: admin.email, role: Role.ADMIN },
      config.jwt.secret,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('summary KPI endpoint returns integer paise figures', async () => {
    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('activeSubscriptions');
    expect(res.body).toHaveProperty('mrr');
    expect(res.body).toHaveProperty('arr');
    expect(res.body).toHaveProperty('revenueCollected');
    expect(res.body).toHaveProperty('outstanding');
    expect(res.body).toHaveProperty('overdue');
    expect(res.body).toHaveProperty('aging');
    expect(Number.isInteger(res.body.mrr)).toBe(true);
    expect(Number.isInteger(res.body.revenueCollected)).toBe(true);
  });

  it('CSV export returns valid CSV content and headers', async () => {
    const res = await request(app)
      .get('/api/reports/export/invoices')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Number,Customer,Email,PeriodStart');
  });

  it('audit log endpoint returns paginated audit history', async () => {
    const res = await request(app)
      .get('/api/reports/audit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

