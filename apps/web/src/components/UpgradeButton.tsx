'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function UpgradeButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkout = async (provider: 'COINPAYMENTS' | 'BINANCE_PAY') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planId, provider }),
      });
      const data = await res.json();
      if (res.status === 401) {
        router.push('/login?next=/pricing');
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Checkout failed');
        return;
      }
      if (data.payUrl) {
        window.location.href = data.payUrl;
      } else {
        setError('Awaiting provider configuration');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 space-y-2">
      <button
        onClick={() => checkout('COINPAYMENTS')}
        disabled={loading}
        className="w-full rounded bg-brand py-2 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
      >
        Pay with CoinPayments
      </button>
      <button
        onClick={() => checkout('BINANCE_PAY')}
        disabled={loading}
        className="w-full rounded border border-brand py-2 text-sm text-brand hover:bg-indigo-50 disabled:opacity-50"
      >
        Pay with Binance Pay
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
