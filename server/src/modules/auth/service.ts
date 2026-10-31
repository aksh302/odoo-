import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import prisma from '../../lib/prisma';
import { config } from '../../config';
import { Errors } from '../../lib/errors';
import { audit } from '../../lib/audit';
import { sendEmail } from '../../lib/mailer';
import { PaginationParams, paginate, PaginatedResponse } from '../../lib/pagination';

const SALT_ROUNDS = 10;

export interface TokenResponse {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: Role;
  };
}

export class AuthService {
  static generateToken(userId: number, email: string, role: Role): string {
    return jwt.sign({ userId, email, role }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as any,
    });
  }

  static async signup(data: {
    name: string;
    email: string;
    password: string;
    company?: string;
    phone?: string;
    billingAddress?: string;
    taxId?: string;
  }): Promise<TokenResponse> {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw Errors.duplicateEmail();
    }

    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: Role.CUSTOMER,
        profile: {
          create: {
            company: data.company,
            phone: data.phone,
            billingAddress: data.billingAddress,
            taxId: data.taxId,
          },
        },
      },
      include: { profile: true },
    });

    await audit({
      userId: user.id,
      action: 'USER_SIGNUP',
      entity: 'User',
      entityId: user.id,
      newValue: { email: user.email, role: user.role },
    });

    const token = this.generateToken(user.id, user.email, user.role);
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  static async login(email: string, password: string): Promise<TokenResponse> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });

    if (!user) {
      throw Errors.invalidCredentials();
    }

    if (!user.isActive) {
      throw Errors.accountDeactivated();
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      throw Errors.invalidCredentials();
    }

    const token = this.generateToken(user.id, user.email, user.role);
    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  static async forgotPassword(email: string): Promise<{ message: string; devToken?: string }> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      // Do not reveal email existence
      return { message: 'If an account exists, a reset link has been dispatched' };
    }

    // Generate random token and store its sha256 hash
    const rawToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour per SRS

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetTokenHash,
        resetExpires,
      },
    });

    const resetLink = `${config.clientUrl}/reset-password?token=${rawToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Reset your Brightloop password',
      html: `<p>Hello ${user.name},</p><p>Click <a href="${resetLink}">here</a> to reset your password. Link expires in 1 hour.</p>`,
    });

    return {
      message: 'If an account exists, a reset link has been dispatched',
      devToken: process.env.NODE_ENV !== 'production' ? rawToken : undefined,
    };
  }

  static async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        resetTokenHash: hash,
        resetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw Errors.unauthorized('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetTokenHash: null,
        resetExpires: null,
      },
    });

    await audit({
      userId: user.id,
      action: 'PASSWORD_RESET',
      entity: 'User',
      entityId: user.id,
    });

    return { message: 'Password has been reset successfully' };
  }

  static async getMe(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw Errors.notFound('User', userId);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      profile: user.profile,
    };
  }

  static async createStaff(actorId: number, data: { name: string; email: string; password?: string }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw Errors.duplicateEmail();

    const pass = data.password || crypto.randomBytes(12).toString('hex');
    const passwordHash = await bcrypt.hash(pass, SALT_ROUNDS);

    const staff = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: Role.STAFF,
      },
    });

    await audit({
      userId: actorId,
      action: 'STAFF_CREATE',
      entity: 'User',
      entityId: staff.id,
      newValue: { email: staff.email },
    });

    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
    };
  }

  static async deactivateUser(actorId: number, targetUserId: number) {
    if (actorId === targetUserId) {
      throw Errors.conflict('Cannot deactivate your own account');
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw Errors.notFound('User', targetUserId);

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { isActive: false },
    });

    await audit({
      userId: actorId,
      action: 'USER_DEACTIVATE',
      entity: 'User',
      entityId: targetUserId,
      oldValue: { isActive: true },
      newValue: { isActive: false },
    });

    return { id: updated.id, isActive: updated.isActive };
  }

  static async listCustomers(pagination: PaginationParams): Promise<PaginatedResponse<any>> {
    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where: { role: Role.CUSTOMER },
        include: { profile: true },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { id: 'desc' },
      }),
      prisma.user.count({ where: { role: Role.CUSTOMER } }),
    ]);

    const sanitized = data.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      profile: u.profile,
    }));

    return paginate(sanitized, total, pagination);
  }

  static async getCustomer(customerId: number) {
    const customer = await prisma.user.findFirst({
      where: { id: customerId, role: Role.CUSTOMER },
      include: { profile: true },
    });
    if (!customer) throw Errors.notFound('Customer', customerId);

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      isActive: customer.isActive,
      profile: customer.profile,
      createdAt: customer.createdAt,
    };
  }

  static async createCustomer(
    actorId: number,
    data: {
      name: string;
      email: string;
      password?: string;
      company?: string;
      phone?: string;
      billingAddress?: string;
      taxId?: string;
    },
  ) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw Errors.duplicateEmail();

    const pass = data.password || crypto.randomBytes(12).toString('hex');
    const passwordHash = await bcrypt.hash(pass, SALT_ROUNDS);

    const customer = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: Role.CUSTOMER,
        profile: {
          create: {
            company: data.company,
            phone: data.phone,
            billingAddress: data.billingAddress,
            taxId: data.taxId,
          },
        },
      },
      include: { profile: true },
    });

    await audit({
      userId: actorId,
      action: 'CUSTOMER_CREATE',
      entity: 'User',
      entityId: customer.id,
      newValue: { email: customer.email },
    });

    return customer;
  }

  static async updateCustomer(
    actorId: number,
    customerId: number,
    data: {
      name?: string;
      company?: string;
      phone?: string;
      billingAddress?: string;
      taxId?: string;
      isActive?: boolean;
    },
  ) {
    const customer = await prisma.user.findFirst({
      where: { id: customerId, role: Role.CUSTOMER },
      include: { profile: true },
    });
    if (!customer) throw Errors.notFound('Customer', customerId);

    const updated = await prisma.user.update({
      where: { id: customerId },
      data: {
        name: data.name,
        isActive: data.isActive,
        profile: {
          upsert: {
            create: {
              company: data.company,
              phone: data.phone,
              billingAddress: data.billingAddress,
              taxId: data.taxId,
            },
            update: {
              company: data.company,
              phone: data.phone,
              billingAddress: data.billingAddress,
              taxId: data.taxId,
            },
          },
        },
      },
      include: { profile: true },
    });

    await audit({
      userId: actorId,
      action: 'CUSTOMER_UPDATE',
      entity: 'User',
      entityId: customerId,
      newValue: data,
    });

    return updated;
  }
}

