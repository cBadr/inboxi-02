import { prisma } from '@inboxi/db';
import { UpgradeButton } from '@/components/UpgradeButton';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const plans = await prisma.plan
    .findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } })
    .catch(() => []);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-center text-3xl font-bold">Pricing</h1>
      <p className="mt-2 text-center text-gray-600">Pay with crypto — CoinPayments or Binance Pay.</p>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {plans.map((p) => (
          <div key={p.id} className="rounded-lg border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">{p.name}</h2>
            <div className="mt-2 text-3xl font-bold">
              ${String(p.priceUsd)}
              <span className="text-base font-normal text-gray-500">/mo</span>
            </div>
            <ul className="mt-4 space-y-1 text-sm text-gray-600">
              <li>{p.maxMailboxes} mailboxes</li>
              <li>{p.dailyReceiveQuota} received/day</li>
              <li>{p.dailySendQuota} sent/day</li>
              <li>{p.retentionDays}-day retention</li>
            </ul>
            {!p.isFree && <UpgradeButton planId={p.id} />}
          </div>
        ))}
        {plans.length === 0 && (
          <p className="col-span-full text-center text-sm text-gray-500">
            Plans will appear once the database is seeded.
          </p>
        )}
      </div>
    </div>
  );
}
