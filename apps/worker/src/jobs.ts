import { prisma } from '@inboxi/db';
import {
  SETTING_KEYS,
  SETTINGS_DEFAULTS,
  effectiveRetentionDays,
  retentionCutoff,
} from '@inboxi/shared';

// Real, reusable job logic — invoked by the BullMQ worker on the server, and
// importable for inline execution / tests.

// Delete anonymous sessions whose destruction timer elapsed (and their
// messages, unless the session was converted to a real account).
export async function cleanupExpiredAnonSessions(now = new Date()): Promise<number> {
  const expired = await prisma.anonymousSession.findMany({
    where: { expiresAt: { lt: now }, userId: null },
    select: { id: true },
  });
  if (expired.length === 0) return 0;
  const ids = expired.map((s) => s.id);
  await prisma.message.deleteMany({ where: { anonymousSessionId: { in: ids } } });
  await prisma.anonymousSession.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

// Read a retention setting from a pre-fetched row set, falling back to the
// shared default when the row is missing or its value isn't a finite number.
function readRetentionDays(
  rows: Array<{ key: string; value: unknown }>,
  key: string,
  fallback: number,
): number {
  const raw = rows.find((r) => r.key === key)?.value;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

// Enforce message retention: platform default (or a subscriber's longer plan
// window) for mailbox mail, plus a separate sweep for orphaned mail nobody
// owns. Anonymous pre-signup mail is never touched here — that's cleanup-anon.
export async function enforceRetention(now = new Date()): Promise<number> {
  const settingRows = await prisma.setting.findMany({
    where: { key: { in: [SETTING_KEYS.MAIL_RETENTION_DAYS, SETTING_KEYS.MAIL_ORPHAN_RETENTION_DAYS] } },
  });
  const defaultDays = readRetentionDays(
    settingRows,
    SETTING_KEYS.MAIL_RETENTION_DAYS,
    SETTINGS_DEFAULTS[SETTING_KEYS.MAIL_RETENTION_DAYS],
  );
  const orphanDays = readRetentionDays(
    settingRows,
    SETTING_KEYS.MAIL_ORPHAN_RETENTION_DAYS,
    SETTINGS_DEFAULTS[SETTING_KEYS.MAIL_ORPHAN_RETENTION_DAYS],
  );

  const users = await prisma.user.findMany({
    select: {
      id: true,
      subscriptions: { where: { status: 'ACTIVE' }, select: { plan: { select: { retentionDays: true } } } },
    },
  });

  // Group users by their effective retention window so we run one deleteMany
  // per distinct window instead of one per user.
  const userIdsByDays = new Map<number, string[]>();
  for (const u of users) {
    const planDays = u.subscriptions.map((s) => s.plan.retentionDays);
    const days = effectiveRetentionDays(planDays, defaultDays);
    const bucket = userIdsByDays.get(days);
    if (bucket) bucket.push(u.id);
    else userIdsByDays.set(days, [u.id]);
  }

  let deleted = 0;
  for (const [days, userIds] of userIdsByDays) {
    const cutoff = retentionCutoff(days, now);
    if (cutoff === null) continue; // 0 = keep forever, nothing to delete
    const res = await prisma.message.deleteMany({
      where: {
        mailbox: { userId: { in: userIds } },
        receivedAt: { lt: cutoff },
        anonymousSessionId: null, // owned by cleanup-anon, never here
      },
    });
    deleted += res.count;
  }

  // Orphan mail: no mailbox at all, or a mailbox nobody has claimed.
  const orphanCutoff = retentionCutoff(orphanDays, now);
  if (orphanCutoff !== null) {
    const res = await prisma.message.deleteMany({
      where: {
        OR: [{ mailboxId: null }, { mailbox: { userId: null } }],
        receivedAt: { lt: orphanCutoff },
        anonymousSessionId: null,
      },
    });
    deleted += res.count;
  }

  return deleted;
}
