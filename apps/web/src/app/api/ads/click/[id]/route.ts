import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';

// Record an ad click and redirect to the ad's target URL.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = await prisma.ad.findUnique({ where: { id } });
  if (!ad) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await prisma.adEvent.create({ data: { adId: ad.id, type: 'click' } }).catch(() => {});

  const target = ad.targetUrl && /^https?:\/\//.test(ad.targetUrl) ? ad.targetUrl : '/';
  return NextResponse.redirect(target);
}
