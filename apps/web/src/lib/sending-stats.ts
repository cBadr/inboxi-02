import { prisma, type OutboundStatus } from '@inboxi/db';

export interface OutboundStats {
  total: number;
  byStatus: Record<string, number>;
  last24hTotal: number;
  last24hFailed: number;
  /** Still sitting in QUEUED/SENDING — accepted by the app, not yet handed off by the MTA. */
  last24hQueued: number;
  queued: number;
  // 0..1 over the last 24h (failed+bounced+deferred+complained / total). Pending rows are
  // neither failed nor sent, so they inflate neither this nor deliveredRate below.
  failureRate: number;
  // 0..1 over the last 24h (SENT / total). Kept apart from failureRate so a growing queue
  // — which is neither a success nor a failure — never gets silently read as either one.
  deliveredRate: number;
}

const FAIL_STATUSES: OutboundStatus[] = ['FAILED', 'BOUNCED', 'COMPLAINED', 'DEFERRED'];
// Accepted by the app but not yet actually delivered by the MTA. This is the status class
// that used to get written as SENT — see lib/send.ts / lib/notify.ts for the fix.
const PENDING_STATUSES: OutboundStatus[] = ['QUEUED', 'SENDING'];

export async function getOutboundStats(): Promise<OutboundStats> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [groups, last24h, last24hFailed, last24hSent, last24hQueued] = await Promise.all([
    prisma.outboundMessage.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.outboundMessage.count({ where: { createdAt: { gte: since } } }),
    prisma.outboundMessage.count({
      where: { createdAt: { gte: since }, status: { in: FAIL_STATUSES } },
    }),
    prisma.outboundMessage.count({ where: { createdAt: { gte: since }, status: 'SENT' } }),
    prisma.outboundMessage.count({
      where: { createdAt: { gte: since }, status: { in: PENDING_STATUSES } },
    }),
  ]);
  const byStatus: Record<string, number> = {};
  let total = 0;
  let queued = 0;
  for (const g of groups) {
    byStatus[g.status] = g._count._all;
    total += g._count._all;
    if (PENDING_STATUSES.includes(g.status)) queued += g._count._all;
  }
  return {
    total,
    byStatus,
    last24hTotal: last24h,
    last24hFailed: last24hFailed,
    last24hQueued: last24hQueued,
    queued,
    failureRate: last24h > 0 ? last24hFailed / last24h : 0,
    deliveredRate: last24h > 0 ? last24hSent / last24h : 0,
  };
}

export interface TransportStat {
  transportType: string;
  sent: number;
  failed: number;
  queued: number;
  total: number;
  // sent / (total - queued): queued rows are excluded from the denominator too, so a growing
  // backlog can no longer masquerade as a falling success rate.
  successRate: number;
}

// Per-transport-type sending breakdown (SELF_HOST vs SMTP_RELAY).
export async function getTransportStats(): Promise<TransportStat[]> {
  const groups = await prisma.outboundMessage.groupBy({
    by: ['transportType', 'status'],
    _count: { _all: true },
  });
  const map = new Map<string, { sent: number; failed: number; queued: number; total: number }>();
  for (const g of groups) {
    const key = g.transportType ?? 'none';
    const cur = map.get(key) ?? { sent: 0, failed: 0, queued: 0, total: 0 };
    cur.total += g._count._all;
    if (g.status === 'SENT') cur.sent += g._count._all;
    if (FAIL_STATUSES.includes(g.status)) cur.failed += g._count._all;
    if (PENDING_STATUSES.includes(g.status)) cur.queued += g._count._all;
    map.set(key, cur);
  }
  return [...map.entries()].map(([transportType, v]) => {
    const settled = v.total - v.queued;
    return {
      transportType,
      sent: v.sent,
      failed: v.failed,
      queued: v.queued,
      total: v.total,
      successRate: settled > 0 ? v.sent / settled : 0,
    };
  });
}
