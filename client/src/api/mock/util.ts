import type { InternalAxiosRequestConfig } from 'axios'
import type { Role, User } from '../../lib/types'

export type MockResult = [number, unknown]

export interface MockCtx {
  body: any
  query: Record<string, any>
  /** values from `:id`-style segments in the route pattern */
  params: Record<string, string>
  /** the logged-in user, or undefined */
  me?: User
  config: InternalAxiosRequestConfig
}

/** 'GET /products/:id' -> handler */
export type MockRoutes = Record<string, (ctx: MockCtx) => MockResult>

export const fail = (status: number, code: string, message: string, fields?: Record<string, string>): MockResult => [
  status,
  { error: { code, message, fields } },
]

/** Returns an error result if the user isn't one of `roles`, else null. */
export function requireRole(ctx: MockCtx, ...roles: Role[]): MockResult | null {
  if (!ctx.me) return fail(401, 'UNAUTHENTICATED', 'Not logged in')
  if (!roles.includes(ctx.me.role)) return fail(403, 'FORBIDDEN', 'Role not allowed')
  return null
}

/** Slices an array into the SRS list shape { data, page, limit, total }. */
export function paginate<T>(all: T[], query: Record<string, any>): MockResult {
  const page = Math.max(1, Number(query.page ?? 1))
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)))
  const start = (page - 1) * limit
  return [200, { data: all.slice(start, start + limit), page, limit, total: all.length }]
}

export const contains = (haystack: unknown, needle: unknown) =>
  String(haystack ?? '').toLowerCase().includes(String(needle ?? '').toLowerCase())

export const todayISO = () => new Date().toISOString().slice(0, 10)

let seq = 1000
export const nextId = () => ++seq

// ---------- audit log (NFR-12) ----------

export interface MockAudit {
  id: number
  at: string
  userId: number | null
  userName: string | null
  action: string
  entity: string
  entityId: number
  entityLabel: string | null
  oldValue: unknown
  newValue: unknown
}

export const auditLog: MockAudit[] = []

/** Records who changed what. Call from any mock route that changes state. */
export function audit(ctx: Pick<MockCtx, 'me'> | null, action: string, entity: string, entityId: number, entityLabel: string | null, oldValue: unknown, newValue: unknown) {
  auditLog.unshift({
    id: nextId(),
    at: new Date().toISOString(),
    userId: ctx?.me?.id ?? null,
    userName: ctx?.me?.name ?? 'System',
    action,
    entity,
    entityId,
    entityLabel,
    oldValue,
    newValue,
  })
}
