'use client';

import { useCallback, useEffect, useState } from 'react';

interface MessagePreview {
  id: string;
  fromAddress: string;
  subject: string | null;
  snippet: string | null;
  receivedAt: string;
  isRead: boolean;
}

interface SessionResponse {
  address: string;
  expiresAt: string;
  gateAfter: number;
}

interface InboxResponse {
  address: string;
  expiresAt: string;
  gated: boolean;
  withheldCount: number;
  gateAfter: number;
  messages: MessagePreview[];
}

function useCountdown(expiresAt: string | null): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setLabel('expired');
        return;
      }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLabel(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return label;
}

export function TempInbox() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const address = inbox?.address ?? session?.address ?? null;
  const expiresAt = inbox?.expiresAt ?? session?.expiresAt ?? null;
  const gateAfter = session?.gateAfter ?? inbox?.gateAfter ?? 3;
  const countdown = useCountdown(expiresAt);

  // Bootstrap the anonymous session once on mount.
  useEffect(() => {
    fetch('/api/anon/session', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SessionResponse | null) => data && setSession(data))
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/anon/messages', { cache: 'no-store' });
      if (res.ok) setInbox((await res.json()) as InboxResponse);
    } catch {
      /* keep last state */
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [session, refresh]);

  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mt-8 rounded-lg border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">Your address</div>
          <div className="font-mono text-lg">{address ?? 'generating…'}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            Expires in <span className="font-mono">{countdown || '—'}</span>
          </span>
          <button
            onClick={copy}
            disabled={!address}
            className="rounded bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <ul className="divide-y">
        {(inbox?.messages ?? []).length === 0 && (
          <li className="p-8 text-center text-sm text-gray-500">
            Waiting for incoming email… messages appear here automatically.
          </li>
        )}
        {(inbox?.messages ?? []).map((m) => (
          <li key={m.id} className="p-4 hover:bg-gray-50">
            <div className="flex items-center justify-between">
              <span className="font-medium">{m.fromAddress}</span>
              <span className="text-xs text-gray-400">
                {new Date(m.receivedAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="text-sm">{m.subject || '(no subject)'}</div>
            {m.snippet && <div className="mt-1 text-xs text-gray-500">{m.snippet}</div>}
          </li>
        ))}
      </ul>

      {inbox?.gated && (
        <div className="border-t bg-amber-50 p-4 text-center text-sm">
          <strong>{inbox.withheldCount}</strong> more message
          {inbox.withheldCount === 1 ? '' : 's'} waiting. You&apos;ve reached the free limit of{' '}
          {gateAfter}.{' '}
          <a href="/signup" className="font-semibold text-brand underline">
            Sign up free
          </a>{' '}
          to unlock them.
        </div>
      )}
    </div>
  );
}
