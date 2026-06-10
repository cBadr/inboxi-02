import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';

function ipHashOf(req: NextRequest): string | null {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '';
  if (!ip) return null;
  return createHash('sha256')
    .update(`${ip}|${process.env.ENCRYPTION_KEY ?? 'ads'}`)
    .digest('hex')
    .slice(0, 32);
}

// Record an ad click and redirect to the ad's target URL.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = await prisma.ad.findUnique({ where: { id } });
  if (!ad) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await prisma.adEvent
    .create({ data: { adId: ad.id, type: 'click', ipHash: ipHashOf(req) } })
    .catch(() => {});

  const target = ad.targetUrl && /^https?:\/\//.test(ad.targetUrl) ? ad.targetUrl : '/';
  return NextResponse.redirect(target);
}
