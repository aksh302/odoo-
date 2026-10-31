import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors';
import { describeDbError } from '../lib/dbErrors';

/**
 * Express error handler.
 * Converts AppError into the standard JSON format.
 * Unknown errors become 500 INTERNAL with no stack trace in the response.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toBody());
    return;
  }

  // Database down or not set up: say so plainly instead of a generic 500
  const db = describeDbError(err);
  if (db) {
    console.error(`[Database] ${db.message} ${db.hint}`);
    res.status(503).json({ error: { code: db.code, message: db.message } });
    return;
  }

  // Log internal errors (no sensitive data)
  console.error('Unhandled error:', err.message);

  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'An unexpected error occurred',
    },
  });
}

