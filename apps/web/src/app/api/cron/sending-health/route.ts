import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';
import { sendTelegramMessage } from '@inboxi/integrations/telegram';
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

  if (alert && process.env.TELEGRAM_BOT_TOKEN) {
    const integration = await prisma.integration.findFirst({
      where: { kind: 'TELEGRAM', isActive: true },
    });
    const chatId = (integration?.config as { chatId?: string } | null)?.chatId;
    if (chatId) {
      const text = [
        '🚨 <b>Inboxi sending health</b>',
        `24h failure rate: <b>${failPct}%</b> (${stats.last24hFailed}/${stats.last24hTotal})`,
        'Check Admin → Outbox for failing messages.',
      ].join('\n');
      await sendTelegramMessage({ botToken: process.env.TELEGRAM_BOT_TOKEN }, chatId, text).catch(
        () => {},
      );
    }
  }

  return NextResponse.json({ ok: true, failPct, last24hTotal: stats.last24hTotal, alerted: alert });
}
