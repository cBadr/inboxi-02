import { prisma } from '@inboxi/db';

/**
 * Canonical audit action names. They live here rather than as string literals
 * at each call site because the audit log is only searchable if the same event
 * is always called the same thing.
 */
export const AUDIT = {
  // authentication
  LOGIN_SUCCESS: 'auth.login_success',
  LOGIN_FAILED: 'auth.login_failed',
  // privileged changes to a person's account
  USER_ROLE_CHANGE: 'user.role_change',
  USER_BAN: 'user.ban',
  USER_UNBAN: 'user.unban',
  USER_QUOTA_CHANGE: 'user.quota_change',
  // access to, and destruction of, customer mail
  MAIL_SEARCH: 'mail.search',
  MAIL_READ_OUTBOUND: 'mail.read_outbound',
  MESSAGE_DELETE: 'message.delete',
  MESSAGE_ARCHIVE: 'message.archive',
  MESSAGE_STAR: 'message.star',
  MESSAGE_READ_STATE: 'message.read_state',
  OUTBOUND_DELETE: 'outbound.delete',
  SCHEDULED_CANCEL: 'scheduled.cancel',
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT] | (string & {});

/**
 * Record an admin/system action for the audit timeline. Never throws — a
 * monitor that breaks the operation it was watching is worse than no monitor.
 */
export async function writeAudit(args: {
  actorId?: string | null;
  action: AuditAction;
  entity?: string;
  entityId?: string;
  /** Caller IP. The column existed from the first migration and was never filled. */
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: args.actorId ?? null,
        action: args.action,
        entity: args.entity ?? null,
        entityId: args.entityId ?? null,
        ipAddress: args.ipAddress ?? null,
        metadata: args.metadata ? (args.metadata as object) : undefined,
      },
    });
  } catch {
    /* audit is best-effort */
  }
}
