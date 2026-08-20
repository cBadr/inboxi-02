import { NextRequest, NextResponse } from 'next/server';
import { sendOperatorAlert, type AlertOutcome } from '@/lib/alerts';
import { getOutboundStats } from '@/lib/sending-stats';

export const dynamic = 'force-dynamic';

// Sending-health monitor. Alerts via Telegram when the 24h failure rate crosses
// a threshold (with a meaningful sample), so deliverability regressions surface
// without watching the Outbox. Triggered by cron:
//   curl "http://127.0.0.1:3000/api/cron/sending-health?secret=<MAIL_INGEST_SECRET>"
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.MAIL_INGEST_SECRET || secret !== process.env.MAIL_INGEST_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const stats = await getOutboundStats();
  const failPct = Math.round(stats.failureRate * 100);
  const alert = stats.last24hTotal >= 20 && failPct >= 20;

  let alertOutcome: AlertOutcome | null = null;
  if (alert) {
    alertOutcome = await sendOperatorAlert(
      [
        '🚨 <b>Inboxi sending health</b>',
        `24h failure rate: <b>${failPct}%</b> (${stats.last24hFailed}/${stats.last24hTotal})`,
        'Check Admin → Outbox for failing messages.',
      ].join('\n'),
    );
  }

  // Report the alert outcome, so a monitor that computes a problem but cannot
  // page anyone shows up in the cron response instead of failing silently.
  return NextResponse.json({
    ok: true,
    failPct,
    last24hTotal: stats.last24hTotal,
    alerted: alert,
    alertDelivered: alertOutcome?.delivered ?? null,
    alertReason: alertOutcome && !alertOutcome.delivered ? alertOutcome.reason : undefined,
  });
}
