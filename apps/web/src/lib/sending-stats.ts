import { prisma, type OutboundStatus } from '@inboxi/db';

export interface OutboundStats {
  total: number;
  byStatus: Record<string, number>;
  last24hTotal: number;
  last24hFailed: number;
  failureRate: number; // 0..1 over the last 24h (failed+bounced / total)
}

const FAIL_STATUSES: OutboundStatus[] = ['FAILED', 'BOUNCED', 'COMPLAINED', 'DEFERRED'];

export async function getOutboundStats(): Promise<OutboundStats> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [groups, last24h, last24hFailed] = await Promise.all([
    prisma.outboundMessage.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.outboundMessage.count({ where: { createdAt: { gte: since } } }),
    prisma.outboundMessage.count({
      where: { createdAt: { gte: since }, status: { in: FAIL_STATUSES } },
    }),
  ]);
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const g of groups) {
    byStatus[g.status] = g._count._all;
    total += g._count._all;
  }
  return {
    total,
    byStatus,
    last24hTotal: last24h,
    last24hFailed: last24hFailed,
    failureRate: last24h > 0 ? last24hFailed / last24h : 0,
  };
}

export interface TransportStat {
  transportType: string;
  sent: number;
  failed: number;
  total: number;
  successRate: number;
}

// Per-transport-type sending breakdown (SELF_HOST vs SMTP_RELAY).
export async function getTransportStats(): Promise<TransportStat[]> {
  const groups = await prisma.outboundMessage.groupBy({
    by: ['transportType', 'status'],
    _count: { _all: true },
  });
  const map = new Map<string, { sent: number; failed: number; total: number }>();
  for (const g of groups) {
    const key = g.transportType ?? 'none';
    const cur = map.get(key) ?? { sent: 0, failed: 0, total: 0 };
    cur.total += g._count._all;
    if (g.status === 'SENT') cur.sent += g._count._all;
    if (FAIL_STATUSES.includes(g.status)) cur.failed += g._count._all;
    map.set(key, cur);
  }
  return [...map.entries()].map(([transportType, v]) => ({
    transportType,
    sent: v.sent,
    failed: v.failed,
    total: v.total,
    successRate: v.total > 0 ? v.sent / v.total : 0,
  }));
}
