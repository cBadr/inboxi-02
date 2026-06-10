import { prisma } from '@inboxi/db';

// Record an admin/system action for the audit timeline. Never throws.
export async function writeAudit(args: {
  actorId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: args.actorId ?? null,
        action: args.action,
        entity: args.entity ?? null,
        entityId: args.entityId ?? null,
        metadata: args.metadata ? (args.metadata as object) : undefined,
      },
    });
  } catch {
    /* audit is best-effort */
  }
}
