/**
 * Shared error classes and codes per SRS 9.6.
 * All API errors use AppError so the error handler can produce a consistent JSON body.
 */

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly fields?: Record<string, string>;

  constructor(code: string, statusCode: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.fields = fields;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toBody(): ErrorBody {
    const body: ErrorBody = {
      error: {
        code: this.code,
        message: this.message,
      },
    };
    if (this.fields) {
      body.error.fields = this.fields;
    }
    return body;
  }
}

// --- Standard error factory functions ---

export const Errors = {
  // Authentication & Authorization
  unauthorized: (message = 'Authentication required') =>
    new AppError('UNAUTHORIZED', 401, message),

  forbidden: (message = 'Insufficient permissions') =>
    new AppError('FORBIDDEN', 403, message),

  invalidCredentials: () =>
    new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password'),

  tokenExpired: () =>
    new AppError('TOKEN_EXPIRED', 401, 'Token has expired'),

  accountDeactivated: () =>
    new AppError('ACCOUNT_DEACTIVATED', 403, 'Account has been deactivated'),

  // Validation
  validationError: (fields: Record<string, string>) =>
    new AppError('VALIDATION_ERROR', 400, 'Validation failed', fields),

  // Resources
  notFound: (entity: string, id?: number | string) =>
    new AppError('NOT_FOUND', 404, id ? `${entity} with id ${id} not found` : `${entity} not found`),

  // Conflicts
  conflict: (message: string) =>
    new AppError('CONFLICT', 409, message),

  duplicateEmail: () =>
    new AppError('DUPLICATE_EMAIL', 409, 'Email already in use'),

  duplicateEntry: (field: string) =>
    new AppError('DUPLICATE_ENTRY', 409, `Duplicate value for ${field}`),

  // Business logic
  invalidTransition: (from: string, to: string) =>
    new AppError('INVALID_TRANSITION', 400, `Cannot transition from ${from} to ${to}`),

  billingLocked: () =>
    new AppError('BILLING_LOCKED', 409, 'Billing run already in progress'),

  periodAlreadyBilled: () =>
    new AppError('PERIOD_ALREADY_BILLED', 409, 'This period has already been billed'),

  discountExhausted: () =>
    new AppError('DISCOUNT_EXHAUSTED', 400, 'Discount usage limit reached'),

  paymentExceedsOutstanding: () =>
    new AppError('PAYMENT_EXCEEDS_OUTSTANDING', 400, 'Payment amount exceeds outstanding balance'),

  invoiceNotCancellable: () =>
    new AppError('INVOICE_NOT_CANCELLABLE', 400, 'Invoice cannot be cancelled: payments have been recorded'),

  planArchived: () =>
    new AppError('PLAN_ARCHIVED', 400, 'Cannot use an archived plan'),

  productArchived: () =>
    new AppError('PRODUCT_ARCHIVED', 400, 'Cannot use an archived product'),

  // Rate limiting
  rateLimited: () =>
    new AppError('RATE_LIMITED', 429, 'Too many requests, please try again later'),

  // AI
  aiUnavailable: (message = 'AI service is temporarily unavailable') =>
    new AppError('AI_UNAVAILABLE', 503, message),

  // Internal
  internal: (message = 'An unexpected error occurred') =>
    new AppError('INTERNAL', 500, message),
};

