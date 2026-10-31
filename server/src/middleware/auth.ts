/**
 * Authentication middleware.
 * Verifies JWT, loads the active user, rejects deactivated users.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../lib/prisma';
import { Errors } from '../lib/errors';
import { Role } from '@prisma/client';

export interface JwtPayload {
  userId: number;
  role: Role;
  email: string;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        role: Role;
        email: string;
        customerId?: number; // Set for CUSTOMER role
      };
    }
  }
}

/**
 * Require authentication on a route.
 * Verifies the JWT from the Authorization header, loads the user, and rejects deactivated users.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Errors.unauthorized('Missing or malformed authorization header');
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // We'll verify the user is still active
    prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, email: true, isActive: true },
    }).then(user => {
      if (!user) {
        return next(Errors.unauthorized('User not found'));
      }
      if (!user.isActive) {
        return next(Errors.accountDeactivated());
      }

      req.user = {
        userId: user.id,
        role: user.role,
        email: user.email,
        customerId: user.role === Role.CUSTOMER ? user.id : undefined,
      };

      next();
    }).catch(next);

  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw Errors.tokenExpired();
    }
    throw Errors.unauthorized('Invalid token');
  }
}

