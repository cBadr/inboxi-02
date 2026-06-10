'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  provisionDns,
  recheckDns,
  scanReputation,
  regenDkim,
  toggleDomainActive,
} from '@/app/admin/actions';

type Action = (formData: FormData) => Promise<void>;

export function DomainActions({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ label: string; done: boolean } | null>(null);
  const router = useRouter();

  const run = (label: string, action: Action) =>
    startTransition(async () => {
      setStatus({ label, done: false });
      const fd = new FormData();
      fd.set('id', id);
      try {
        await action(fd);
        setStatus({ label, done: true });
        router.refresh();
        setTimeout(() => setStatus(null), 3500);
      } catch {
        setStatus({ label: `${label} failed`, done: true });
      }
    });

  const btn =
    'rounded px-3 py-1.5 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button disabled={pending} onClick={() => run('Provisioning DNS', provisionDns)} className={`${btn} bg-brand text-white hover:bg-brand-dark`}>
        Provision DNS
      </button>
      <button disabled={pending} onClick={() => run('Re-checking DNS', recheckDns)} className={`${btn} border hover:bg-gray-50`}>
        Re-check DNS
      </button>
      <button disabled={pending} onClick={() => run('Scanning reputation', scanReputation)} className={`${btn} border hover:bg-gray-50`}>
        Reputation scan
      </button>
      <button disabled={pending} onClick={() => run('Regenerating DKIM', regenDkim)} className={`${btn} border hover:bg-gray-50`}>
        Regenerate DKIM
      </button>
      <button disabled={pending} onClick={() => run(isActive ? 'Deactivating' : 'Activating', toggleDomainActive)} className={`${btn} border hover:bg-gray-50`}>
        {isActive ? 'Deactivate' : 'Activate'}
      </button>
      {status && (
        <span className="ml-1 inline-flex items-center gap-1.5 text-sm text-gray-600">
          {status.done ? (
            <span className="text-green-600">✓</span>
          ) : (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-brand" />
          )}
          {status.label}
          {status.done ? ' — done' : '…'}
        </span>
      )}
    </div>
  );
}
