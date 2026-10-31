import type { FormInstance } from 'antd'
import { isAxiosError } from 'axios'
import type { ApiErrorBody } from '../lib/types'

// Friendly text for the error codes listed in SRS 9.6.
const MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Please fix the highlighted fields.',
  UNAUTHENTICATED: 'Your session has expired. Please log in again.',
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: 'Not found.',
  EMAIL_TAKEN: 'An account with this email already exists.',
  INVALID_TRANSITION: "That status change isn't allowed.",
  PLAN_FLAG_DISABLED: "This plan doesn't allow that action.",
  QUOTATION_EXPIRED: 'This quotation has expired.',
  QTY_BELOW_MIN: "Quantity is below the plan's minimum.",
  PLAN_NOT_AVAILABLE: 'This plan is not available right now.',
  INVOICE_LOCKED: "That action isn't allowed on this invoice.",
  OVERPAYMENT: 'Amount is more than the outstanding balance.',
  BILLING_RUNNING: 'A billing run is already in progress.',
  RATE_LIMITED: 'Too many attempts. Please wait a few minutes.',
  NOT_BUILT: 'This part of the server isn’t ready yet. Switch it back to mock data in .env (VITE_REAL_API).',
  // Codes the server (server/) uses
  DUPLICATE_EMAIL: 'An account with this email already exists.',
  BILLING_LOCKED: 'A billing run is already in progress.',
  PAYMENT_EXCEEDS_OUTSTANDING: 'Amount is more than the outstanding balance.',
  INVOICE_NOT_CANCELLABLE: 'Invoices with payments recorded cannot be cancelled.',
  EMAIL_SEND_FAILED: "The email couldn't be sent. The server's email (SMTP) settings in server/.env aren't set up.",
  DATABASE_UNAVAILABLE: "The server can't reach its database. Check DATABASE_URL in server/.env (the server's terminal says more).",
  DATABASE_NOT_SET_UP: 'The database has no tables yet. Run: npm --prefix server run db:setup',
}

export interface ParsedError {
  code: string
  message: string
  fields?: Record<string, string>
}

export function parseError(err: unknown): ParsedError {
  if (isAxiosError<ApiErrorBody>(err)) {
    const body = err.response?.data?.error
    if (body) {
      return {
        code: body.code,
        message: MESSAGES[body.code] ?? body.message,
        fields: body.fields,
      }
    }
    // No answer, or the dev proxy couldn't reach the API (it replies 500/502/503/504 with no JSON body)
    if (!err.response || [500, 502, 503, 504].includes(err.response.status))
      return { code: 'NETWORK', message: 'Cannot reach the server. Is it running? Start it with npm run dev.' }
  }
  return { code: 'UNKNOWN', message: 'Something went wrong.' }
}

/** Puts API field errors under the matching Ant Design form fields. Returns the parsed error. */
export function applyFieldErrors(form: FormInstance, err: unknown): ParsedError {
  const parsed = parseError(err)
  if (parsed.fields) {
    form.setFields(
      // "lines.0.quantity" -> ['lines', 0, 'quantity'] so list fields get their error too
      Object.entries(parsed.fields).map(([name, msg]) => ({
        name: name.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
        errors: [msg],
      })),
    )
  }
  return parsed
}
