import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';
import { extractOtp } from '@inboxi/shared';
import { authenticateApiKey } from '@/lib/apikey';

// GET /api/v1/messages?mailbox=<id>&limit=50 — list messages for one of the
// caller's mailboxes. Each message includes any extracted OTP code.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const mailboxId = req.nextUrl.searchParams.get('mailbox');
  if (!mailboxId) return NextResponse.json({ error: 'missing_mailbox' }, { status: 422 });

  const mailbox = await prisma.mailbox.findUnique({ where: { id: mailboxId } });
  if (!mailbox || mailbox.userId !== auth.userId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 50)));
  const messages = await prisma.message.findMany({
    where: { mailboxId },
    orderBy: { receivedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      fromAddress: true,
      toAddress: true,
      subject: true,
      snippet: true,
      textBody: true,
      receivedAt: true,
      isRead: true,
    },
  });

  const data = messages.map((m) => ({
    ...m,
    otp: extractOtp({ subject: m.subject ?? undefined, text: m.textBody ?? undefined })?.code ?? null,
  }));

  return NextResponse.json({ data });
}
