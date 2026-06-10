import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';
import { getSetting } from '@/lib/settings';

// Returns the messages visible to an anonymous session. Messages beyond the
// gate threshold are stored but withheld (only their count is exposed) until
// the visitor registers.
export async function GET(req: NextRequest) {
  const token = req.cookies.get('inboxi_anon')?.value;
  if (!token) {
    return NextResponse.json({ error: 'no_session' }, { status: 401 });
  }

  const session = await prisma.anonymousSession.findUnique({ where: { token } });
  if (!session) {
    return NextResponse.json({ error: 'invalid_session' }, { status: 401 });
  }

  const gateAfter = await getSetting('tempmail.gateAfterMessages');

  const messages = await prisma.message.findMany({
    where: { anonymousSessionId: session.id },
    orderBy: { receivedAt: 'desc' },
    select: {
      id: true,
      fromAddress: true,
      subject: true,
      snippet: true,
      receivedAt: true,
      isRead: true,
    },
  });

  // Once the session is converted (the visitor registered), the gate is lifted
  // and every message is visible.
  const isConverted = session.userId != null;
  const visible = isConverted ? messages : messages.slice(0, gateAfter);
  const withheld = isConverted ? 0 : Math.max(0, messages.length - gateAfter);

  return NextResponse.json({
    address: session.tempAddress,
    expiresAt: session.expiresAt.toISOString(),
    gated: withheld > 0,
    withheldCount: withheld,
    gateAfter,
    messages: visible,
  });
}
