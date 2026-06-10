import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';
import { processScheduledMessage } from '@/lib/compose';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Process due scheduled messages. Triggered by cron every minute:
//   curl "http://127.0.0.1:3000/api/cron/scheduled-sends?secret=<MAIL_INGEST_SECRET>"
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.MAIL_INGEST_SECRET || secret !== process.env.MAIL_INGEST_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const due = await prisma.scheduledMessage.findMany({
    where: { status: 'PENDING', scheduleAt: { lte: new Date() } },
    orderBy: { scheduleAt: 'asc' },
    take: 20,
    select: { id: true },
  });

  for (const row of due) {
    await processScheduledMessage(row.id).catch(() => {});
  }

  return NextResponse.json({ ok: true, processed: due.length });
}
