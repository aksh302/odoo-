import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { config } from '../src/config';
import bcrypt from 'bcrypt';

describe('RBAC Real Database Integration (SRS 2.1)', () => {
  let adminToken: string;
  let staffToken: string;
  let customerToken: string;
  let customerId: number;

  beforeAll(async () => {
    const hash = await bcrypt.hash('Test@123', 8);

    const admin = await prisma.user.create({
      data: {
        name: 'RBAC Admin',
        email: `rbac_admin_${Date.now()}@test.com`,
        passwordHash: hash,
        role: Role.ADMIN,
      },
    });
    adminToken = jwt.sign(
      { userId: admin.id, email: admin.email, role: Role.ADMIN },
      config.jwt.secret,
    );

    const staff = await prisma.user.create({
      data: {
        name: 'RBAC Staff',
        email: `rbac_staff_${Date.now()}@test.com`,
        passwordHash: hash,
        role: Role.STAFF,
      },
    });
    staffToken = jwt.sign(
      { userId: staff.id, email: staff.email, role: Role.STAFF },
      config.jwt.secret,
    );

    const cust = await prisma.user.create({
      data: {
        name: 'RBAC Cust',
        email: `rbac_cust_${Date.now()}@test.com`,
        passwordHash: hash,
        role: Role.CUSTOMER,
      },
    });
    customerId = cust.id;
    customerToken = jwt.sign(
      { userId: cust.id, email: cust.email, role: Role.CUSTOMER },
      config.jwt.secret,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('admin can create staff, staff cannot (403)', async () => {
    const staffRes = await request(app)
      .post('/api/auth/staff')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ name: 'Sub Staff', email: `sub_${Date.now()}@test.com` });
    expect(staffRes.status).toBe(403);

    const adminRes = await request(app)
      .post('/api/auth/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sub Staff', email: `sub_${Date.now()}@test.com` });
    expect(adminRes.status).toBe(201);
  });

  it('admin can deactivate user, staff cannot (403)', async () => {
    const staffRes = await request(app)
      .post(`/api/auth/users/${customerId}/deactivate`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffRes.status).toBe(403);

    const adminRes = await request(app)
      .post(`/api/auth/users/${customerId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
  });

  it('customer cannot access staff/admin billing run (403)', async () => {
    const res = await request(app)
      .post('/api/billing/run')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

