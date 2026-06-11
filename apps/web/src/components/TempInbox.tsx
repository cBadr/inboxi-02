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

  const messages = inbox?.messages ?? [];
  const expiring = countdown === 'expired';

  return (
    <div className="relative">
      {/* soft glow behind the card */}
      <div
        aria-hidden
        className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-br from-brand/20 via-accent/10 to-transparent blur-2xl"
      />
      <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/80 shadow-xl backdrop-blur">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r from-brand/5 to-accent/5 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-green-400" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Live address
            </div>
            <div className="mt-1 truncate font-mono text-base font-semibold text-gray-900 sm:text-lg">
              {address ?? (
                <span className="inline-block h-5 w-48 rounded skeleton align-middle" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${expiring ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}
            >
              ⏳ <span className="font-mono">{countdown || '—'}</span>
            </span>
            <button
              onClick={copy}
              disabled={!address}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-dark active:translate-y-0 disabled:opacity-50"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* messages */}
        <ul className="max-h-[22rem] divide-y divide-gray-100 overflow-y-auto">
          {messages.length === 0 && (
            <li className="px-6 py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 animate-float items-center justify-center rounded-2xl bg-brand/10 text-2xl">
                📭
              </div>
              <p className="text-sm font-medium text-gray-600">Waiting for incoming email…</p>
              <p className="mt-1 text-xs text-gray-400">Messages appear here automatically — no refresh needed.</p>
            </li>
          )}
          {messages.map((m) => (
            <li key={m.id} className="group flex gap-3 px-4 py-3 transition hover:bg-brand/5">
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent text-xs font-semibold text-white"
              >
                {(m.fromAddress[0] ?? '?').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-gray-900">{m.fromAddress}</span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {new Date(m.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="truncate text-sm text-gray-700">{m.subject || '(no subject)'}</div>
                {m.snippet && <div className="mt-0.5 truncate text-xs text-gray-400">{m.snippet}</div>}
              </div>
            </li>
          ))}
        </ul>

        {/* gate CTA */}
        {inbox?.gated && (
          <div className="border-t bg-gradient-to-r from-amber-50 to-orange-50 p-4 text-center text-sm">
            <strong className="text-amber-700">{inbox.withheldCount}</strong> more message
            {inbox.withheldCount === 1 ? '' : 's'} waiting — you&apos;ve hit the free limit of {gateAfter}.{' '}
            <a href="/signup" className="font-semibold text-brand underline-offset-2 hover:underline">
              Sign up free to unlock →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
