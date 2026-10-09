import { NextRequest, NextResponse } from 'next/server';
import { formatOperatorAlert } from '@inboxi/shared';
import { adminLink, sendOperatorAlert, type AlertOutcome } from '@/lib/alerts';
import { getOutboundStats } from '@/lib/sending-stats';
import { readOutboundSpool } from '@/lib/mail-spool';

export const dynamic = 'force-dynamic';

// Same thresholds as the "Outbound queue" card on Admin → Delivery — this monitor pages the
// operator for exactly the condition that card would show as a red warning.
const QUEUE_DEPTH_ALERT = 1000;
const QUEUE_AGE_ALERT_MINUTES = 60;

// Sending-health monitor. Alerts via Telegram when the 24h failure rate crosses a threshold
// (with a meaningful sample) OR the outbound MTA queue backs up — the failure-rate check alone
// is blind to messages that were accepted and then just sat there (the 254k-message incident
// this queue check exists to catch). Triggered by cron:
//   curl "http://127.0.0.1:3000/api/cron/sending-health?secret=<MAIL_INGEST_SECRET>"
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.MAIL_INGEST_SECRET || secret !== process.env.MAIL_INGEST_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const [stats, spool] = await Promise.all([getOutboundStats(), readOutboundSpool()]);
  const failPct = Math.round(stats.failureRate * 100);
  const failureAlert = stats.last24hTotal >= 20 && failPct >= 20;
  // Only meaningful where the MTA is colocated with the app (spool.available) — nothing to
  // check on a dev machine or an app node with no local queue.
  const queueAlert =
    spool.available &&
    (spool.depth > QUEUE_DEPTH_ALERT || (spool.oldestMinutes ?? 0) > QUEUE_AGE_ALERT_MINUTES);
  const alert = failureAlert || queueAlert;

  let alertOutcome: AlertOutcome | null = null;
  if (alert) {
    const rows: { label: string; value: string; strong?: boolean }[] = [];
    if (failureAlert) {
      rows.push({
        label: '24h failure rate',
        value: `${failPct}% (${stats.last24hFailed} of ${stats.last24hTotal} failed)`,
        strong: true,
      });
    }
    if (queueAlert) {
      rows.push({
        label: 'Outbound queue',
        value: `${spool.depth.toLocaleString()} messages, oldest ${spool.oldestMinutes ?? '?'} min`,
        strong: true,
      });
    }
    const delivery = adminLink('/admin/delivery');
    alertOutcome = await sendOperatorAlert(
      formatOperatorAlert({
        severity: 'critical',
        title: 'Sending health',
        subtitle: 'Outbound mail needs attention',
        rows,
        note: 'Check Admin → Delivery for the failing transports and the queue.',
        links: delivery ? [{ text: '📊 Open Delivery', url: delivery }] : [],
      }),
    );
  }

  // Report the alert outcome, so a monitor that computes a problem but cannot
  // page anyone shows up in the cron response instead of failing silently.
  return NextResponse.json({
    ok: true,
    failPct,
    last24hTotal: stats.last24hTotal,
    queueDepth: spool.available ? spool.depth : null,
    queueOldestMinutes: spool.available ? spool.oldestMinutes : null,
    alerted: alert,
    alertDelivered: alertOutcome?.delivered ?? null,
    alertReason: alertOutcome && !alertOutcome.delivered ? alertOutcome.reason : undefined,
  });
}
