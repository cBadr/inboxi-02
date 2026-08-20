import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@inboxi/db';
import { sendOperatorAlert, type AlertOutcome } from '@/lib/alerts';
import { verifyDomainDns, runReputationScan, getDeliverability } from '@/lib/domain-health';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Scheduled deliverability monitor. Re-verifies DNS + reputation for every active
// domain, auto-heals DKIM (provision self-heals), and alerts via Telegram on any
// domain whose deliverability degraded. Triggered by cron:
//   curl "http://127.0.0.1:3000/api/cron/deliverability?secret=<MAIL_INGEST_SECRET>"
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.MAIL_INGEST_SECRET || secret !== process.env.MAIL_INGEST_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const domains = await prisma.domain.findMany({ where: { isActive: true } });
  const problems: Array<{ domain: string; score: number; issues: string[] }> = [];

  for (const d of domains) {
    await verifyDomainDns(d.id).catch(() => {});
    await runReputationScan(d.id).catch(() => {});
    const fresh = await prisma.domain.findUnique({
      where: { id: d.id },
      include: { reputationChecks: { orderBy: { checkedAt: 'desc' }, take: 6 } },
    });
    if (!fresh) continue;
    const view = await getDeliverability(fresh);
    // Persist the snapshot so the admin domains list renders fresh scores.
    await prisma.domain
      .update({
        where: { id: d.id },
        data: {
          deliverabilityScore: view.score,
          inboxScore: view.inbox,
          deliverabilityCheckedAt: new Date(),
        },
      })
      .catch(() => {});
    const failing = view.checks.filter((c) => !c.ok).map((c) => c.label);
    if (view.score < 100 && failing.length > 0) {
      problems.push({ domain: d.name, score: view.score, issues: failing });
    }
  }

  // Page the platform owner when something regressed.
  let alertOutcome: AlertOutcome | null = null;
  if (problems.length > 0) {
    alertOutcome = await sendOperatorAlert(
      ['⚠️ <b>Inboxi deliverability check</b>']
        .concat(problems.map((p) => `• ${p.domain} (${p.score}/100): ${p.issues.join(', ')}`))
        .join('\n'),
    );
  }

  // Report the alert outcome, so a monitor that finds problems but cannot page
  // anyone shows up in the cron response instead of failing silently.
  return NextResponse.json({
    ok: true,
    checked: domains.length,
    problems,
    alertDelivered: alertOutcome?.delivered ?? null,
    alertReason: alertOutcome && !alertOutcome.delivered ? alertOutcome.reason : undefined,
  });
}
