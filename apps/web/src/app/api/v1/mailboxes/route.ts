import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';
import { authenticateApiKey } from '@/lib/apikey';

// GET /api/v1/mailboxes — list the authenticated user's mailboxes.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const mailboxes = await prisma.mailbox.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, address: true, displayName: true, createdAt: true },
  });
  return NextResponse.json({ data: mailboxes });
}
