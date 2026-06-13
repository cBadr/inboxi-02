import { requireAdmin } from '@/lib/session';
import { GATEWAYS, getGatewayConfig, gatewayConfigured } from '@/lib/payments-config';
import { saveGateways } from '../payment-actions';

export const dynamic = 'force-dynamic';

const NOTES: Record<string, string> = {
  NOWPAYMENTS: 'Hosted invoice + IPN. Set NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET.',
  COINPAYMENTS: 'IPN verified. Set COINPAYMENTS_PUBLIC_KEY and COINPAYMENTS_IPN_SECRET.',
  BINANCE_PAY: 'Webhook verified. Set BINANCE_PAY_API_KEY and BINANCE_PAY_API_SECRET.',
};

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const cfg = await getGatewayConfig();

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payment gateways</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enable the crypto gateways buyers can choose from and pick the default. Disabled gateways
          never appear at checkout.
        </p>
      </div>

      <form action={saveGateways} className="space-y-3">
        {GATEWAYS.map((g) => {
          const configured = gatewayConfigured(g.provider);
          return (
            <div key={g.provider} className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name={`enabled_${g.provider}`}
                    defaultChecked={cfg.enabled[g.provider]}
                    className="h-4 w-4"
                  />
                  <span className="font-medium text-gray-900">{g.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      configured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {configured ? 'configured' : 'no credentials (dev mode)'}
                  </span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  <input
                    type="radio"
                    name="default"
                    value={g.provider}
                    defaultChecked={cfg.default === g.provider}
                  />
                  default
                </label>
              </div>
              <p className="mt-2 pl-7 text-xs text-gray-400">{NOTES[g.provider]}</p>
            </div>
          );
        })}

        <div className="flex items-center gap-3 pt-1">
          <button className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Save gateways
          </button>
          <span className="text-xs text-gray-400">
            Without credentials, a gateway still works in dev via the simulate flow.
          </span>
        </div>
      </form>
    </div>
  );
}
