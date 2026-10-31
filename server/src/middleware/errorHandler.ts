import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors';

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

  // Log internal errors (no sensitive data)
  console.error('Unhandled error:', err.message);

  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'An unexpected error occurred',
    },
  });
}

