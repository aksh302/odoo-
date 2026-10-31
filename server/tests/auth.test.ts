import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';
import prisma from '../src/lib/prisma';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { config } from '../src/config';

vi.mock('../src/lib/prisma', () => {
  return {
    default: {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    },
  };
});

describe('Auth & Customer API (Phase 2)', () => {
  it('rejects unauthenticated requests to /me', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('authenticates valid token on /me', async () => {
    const fakeUser = {
      id: 1,
      name: 'Admin Test',
      email: 'admin@test.com',
      role: Role.ADMIN,
      isActive: true,
      profile: null,
    };
    (prisma.user.findUnique as any).mockResolvedValue(fakeUser);

    const token = jwt.sign(
      { userId: 1, email: 'admin@test.com', role: Role.ADMIN },
      config.jwt.secret,
      { expiresIn: '1h' },
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('admin@test.com');
  });

  it('rejects deactivated user even with valid token', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 2,
      email: 'deactivated@test.com',
      role: Role.CUSTOMER,
      isActive: false,
    });

    const token = jwt.sign(
      { userId: 2, email: 'deactivated@test.com', role: Role.CUSTOMER },
      config.jwt.secret,
      { expiresIn: '1h' },
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');
  });

  it('blocks non-admin from creating staff', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 3,
      email: 'staff@test.com',
      role: Role.STAFF,
      isActive: true,
    });

    const token = jwt.sign(
      { userId: 3, email: 'staff@test.com', role: Role.STAFF },
      config.jwt.secret,
    );

    const res = await request(app)
      .post('/api/auth/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Staff', email: 'newstaff@test.com', password: 'password123' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

