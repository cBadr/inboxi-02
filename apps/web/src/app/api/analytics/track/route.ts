import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';

// Lightweight first-party analytics ingest. Stores append-only events; the IP
// is hashed (never stored raw) for privacy.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { type?: string; path?: string; referrer?: string; properties?: Record<string, unknown> }
    | null;
  if (!body?.type) return NextResponse.json({ error: 'missing_type' }, { status: 422 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ipHash = createHash('sha256').update(ip).digest('hex').slice(0, 32);

  await prisma.analyticsEvent
    .create({
      data: {
        type: body.type.slice(0, 64),
        path: body.path?.slice(0, 512) ?? null,
        referrer: body.referrer?.slice(0, 512) ?? null,
        ipHash,
        userAgent: req.headers.get('user-agent')?.slice(0, 512) ?? null,
        properties: (body.properties as object) ?? undefined,
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
