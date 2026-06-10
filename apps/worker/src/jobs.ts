import { prisma } from '@inboxi/db';

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

// Enforce per-plan message retention: delete mailbox messages older than the
// owning user's plan retention window (free plan default when no subscription).
export async function enforceRetention(now = new Date()): Promise<number> {
  const freePlan = await prisma.plan.findUnique({ where: { slug: 'free' } });
  const defaultDays = freePlan?.retentionDays ?? 1;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      subscriptions: { where: { status: 'ACTIVE' }, include: { plan: true } },
    },
  });

  let deleted = 0;
  for (const u of users) {
    const days = u.subscriptions.length
      ? Math.max(...u.subscriptions.map((s) => s.plan.retentionDays))
      : defaultDays;
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const res = await prisma.message.deleteMany({
      where: { mailbox: { userId: u.id }, receivedAt: { lt: cutoff } },
    });
    deleted += res.count;
  }
  return deleted;
}
