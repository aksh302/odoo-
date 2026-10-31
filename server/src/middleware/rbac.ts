/**
 * Role-based access control middleware.
 * Must run after requireAuth.
 */

import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { Errors } from '../lib/errors';

/**
 * Create a middleware that requires the user to have one of the specified roles.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw Errors.unauthorized();
    }

    if (!roles.includes(req.user.role)) {
      throw Errors.forbidden(`Requires one of: ${roles.join(', ')}`);
    }

    next();
  };
}

