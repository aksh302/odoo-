/**
 * Audit log helper.
 * Creates audit log entries for tracking changes.
 */

import prisma from './prisma';

export interface AuditEntry {
  userId?: number;
  action: string;
  entity: string;
  entityId: number;
  oldValue?: any;
  newValue?: any;
}

/**
 * Log an audit entry.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      oldValue: entry.oldValue ?? undefined,
      newValue: entry.newValue ?? undefined,
    },
  });
}

/**
 * Log an audit entry within a transaction.
 */
export async function auditTx(
  tx: any, // Prisma transaction client
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      oldValue: entry.oldValue ?? undefined,
      newValue: entry.newValue ?? undefined,
    },
  });
}

