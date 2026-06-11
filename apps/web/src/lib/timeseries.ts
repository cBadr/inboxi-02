import { prisma } from '@inboxi/db';

export interface DayPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

// Zero-fill a sparse daily count map across the last `days` days (oldest→newest).
function fill(map: Map<string, number>, days: number): DayPoint[] {
  const out: DayPoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: map.get(key) ?? 0 });
  }
  return out;
}

async function rawDaily(
  table: string,
  column: string,
  days: number,
  extraWhere = '',
): Promise<DayPoint[]> {
  // table/column are fixed literals from the callers below (never user input).
  const sql = `
    SELECT to_char(date_trunc('day', "${column}"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
    FROM "${table}"
    WHERE "${column}" >= NOW() - INTERVAL '${days} days' ${extraWhere}
    GROUP BY 1`;
  const rows = await prisma.$queryRawUnsafe<Array<{ day: string; count: number }>>(sql).catch(
    () => [] as Array<{ day: string; count: number }>,
  );
  return fill(new Map(rows.map((r) => [r.day, Number(r.count)])), days);
}

export function dailyInbound(days = 30): Promise<DayPoint[]> {
  return rawDaily('Message', 'receivedAt', days);
}
export function dailyOutbound(days = 30): Promise<DayPoint[]> {
  return rawDaily('OutboundMessage', 'createdAt', days, `AND "status" = 'SENT'`);
}
export function dailyUsers(days = 30): Promise<DayPoint[]> {
  return rawDaily('User', 'createdAt', days);
}
export function dailyEvents(days = 30): Promise<DayPoint[]> {
  return rawDaily('AnalyticsEvent', 'createdAt', days);
}

export function seriesTotal(points: DayPoint[]): number {
  return points.reduce((s, p) => s + p.count, 0);
}
