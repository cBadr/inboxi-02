'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PaymentProviderType } from '@inboxi/db';

interface Gateway {
  provider: PaymentProviderType;
  label: string;
}

export function UpgradeButton({ planId, gateways }: { planId: string; gateways: Gateway[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkout = async (provider: PaymentProviderType) => {
    setLoading(provider);
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
        setError('This gateway is awaiting configuration.');
      }
    } finally {
      setLoading(null);
    }
  };

  if (gateways.length === 0) {
    return <p className="mt-4 text-xs text-gray-400">Payments are temporarily unavailable.</p>;
  }

  return (
    <div className="mt-4 space-y-2">
      {gateways.map((g, i) => (
        <button
          key={g.provider}
          onClick={() => checkout(g.provider)}
          disabled={loading !== null}
          className={`w-full rounded-lg py-2 text-sm font-medium transition disabled:opacity-50 ${
            i === 0
              ? 'bg-brand text-white hover:bg-brand-dark'
              : 'border border-brand text-brand hover:bg-indigo-50'
          }`}
        >
          {loading === g.provider ? 'Starting…' : `Pay with ${g.label}`}
        </button>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
