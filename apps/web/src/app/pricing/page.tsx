import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { UpgradeButton } from '@/components/UpgradeButton';
import { Reveal } from '@/components/Reveal';
import { enabledGateways } from '@/lib/payments-config';
import { planPerks } from '@/lib/plan-display';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const [allPlans, gateways] = await Promise.all([
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }).catch(() => []),
    enabledGateways(),
  ]);
  const gatewayNames = gateways.map((g) => g.label).join(', ') || 'crypto';

  // Visitors are already on the free tier — only paid plans are offered here.
  const plans = allPlans.filter((p) => !p.isFree);

  // Mark the middle paid plan as "most popular".
  const popularId = plans.length ? plans[Math.floor((plans.length - 1) / 2)]!.id : null;

  return (
    <div className="bg-hero-mesh">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center rounded-full border border-brand/20 bg-white/70 px-3 py-1 text-xs font-medium text-brand backdrop-blur">
            Simple, crypto-only pricing
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Pick the plan that fits
          </h1>
          <p className="mt-3 text-lg text-gray-600">
            Start free, upgrade only when you need more. Pay with {gatewayNames} — cancel anytime.
          </p>
        </Reveal>

        {plans.length === 0 ? (
          <p className="mt-12 text-center text-sm text-gray-500">Plans will appear once configured.</p>
        ) : (
          <div className="mt-12 grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((p, i) => {
              const popular = p.id === popularId;
              const perks = planPerks(p);
              return (
                <Reveal key={p.id} delay={i * 80} className="h-full">
                  <div
                    className={`relative flex h-full flex-col rounded-2xl border bg-white p-6 transition hover:-translate-y-1 hover:shadow-xl ${
                      popular ? 'border-brand shadow-lg ring-1 ring-brand/30' : 'shadow-sm'
                    }`}
                  >
                    {popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[11px] font-semibold text-white shadow">
                        Most popular
                      </span>
                    )}
                    <h2 className="text-lg font-bold text-gray-900">{p.name}</h2>
                    {p.description && <p className="mt-1 text-sm text-gray-500">{p.description}</p>}
                    <div className="mt-4 flex items-end gap-1">
                      <span className="text-4xl font-extrabold tracking-tight text-gray-900">
                        ${String(p.priceUsd)}
                      </span>
                      {!p.isFree && (
                        <span className="pb-1 text-sm text-gray-500">
                          / {p.billingPeriodDays === 30 ? 'mo' : `${p.billingPeriodDays}d`}
                        </span>
                      )}
                    </div>

                    <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                      {perks.map((perk) => (
                        <li key={perk} className="flex items-start gap-2 text-gray-700">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-100 text-[10px] text-green-700">
                            ✓
                          </span>
                          {perk}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-6">
                      {p.isFree ? (
                        <Link
                          href="/signup"
                          className="block w-full rounded-lg border border-brand py-2 text-center text-sm font-semibold text-brand transition hover:bg-brand/5"
                        >
                          Get started free
                        </Link>
                      ) : (
                        <UpgradeButton planId={p.id} gateways={gateways} />
                      )}
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}

        {/* assurance strip */}
        <Reveal className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
          <span className="inline-flex items-center gap-1.5">🔒 Crypto payments</span>
          <span className="inline-flex items-center gap-1.5">✓ Cancel anytime</span>
          <span className="inline-flex items-center gap-1.5">⚡ Instant activation</span>
          <Link href="/#faq" className="text-brand hover:underline">
            Read the FAQ →
          </Link>
        </Reveal>
      </div>
    </div>
  );
}
