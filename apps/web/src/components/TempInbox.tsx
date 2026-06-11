'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

function useRemaining(expiresAt: string | null): { label: string; ms: number } {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setMs(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { label: ms <= 0 ? 'expired' : `${m}:${s.toString().padStart(2, '0')}`, ms };
}

// Pull a likely verification code out of a subject/snippet (client-side hint).
function extractCode(subject: string | null, snippet: string | null): string | null {
  const text = `${subject ?? ''} ${snippet ?? ''}`;
  if (!/(code|otp|verif|pin|password|confirm|2fa|one[-\s]?time)/i.test(text)) return null;
  const m = text.match(/\b(\d{4,8})\b/);
  return m ? m[1]! : null;
}

const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
function avatarColor(addr: string): string {
  let h = 0;
  for (let i = 0; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export function TempInbox() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const seenIds = useRef<Set<string>>(new Set());
  const maxMs = useRef(0);

  const address = inbox?.address ?? session?.address ?? null;
  const expiresAt = inbox?.expiresAt ?? session?.expiresAt ?? null;
  const gateAfter = session?.gateAfter ?? inbox?.gateAfter ?? 3;
  const { label: countdown, ms: remainingMs } = useRemaining(expiresAt);

  const messages = inbox?.messages ?? [];
  const withheld = inbox?.withheldCount ?? 0;
  const received = messages.length + withheld;

  // Capture the longest remaining time we observe as "full" for the ring.
  if (remainingMs > maxMs.current) maxMs.current = remainingMs;
  const fraction = maxMs.current > 0 ? Math.max(0, Math.min(1, remainingMs / maxMs.current)) : 0;
  const ringColor = fraction > 0.5 ? '#10b981' : fraction > 0.2 ? '#f59e0b' : '#ef4444';

  const bootstrap = useCallback(async (fresh = false) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/anon/session${fresh ? '?fresh=1' : ''}`, { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as SessionResponse;
        if (fresh) {
          maxMs.current = 0;
          seenIds.current = new Set();
          setInbox(null);
          setExpanded(null);
        }
        setSession(data);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/anon/messages', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as InboxResponse;
      // Flag freshly-arrived messages for the slide-in animation.
      const fresh = new Set<string>();
      for (const m of data.messages) {
        if (!seenIds.current.has(m.id)) {
          fresh.add(m.id);
          seenIds.current.add(m.id);
        }
      }
      if (fresh.size) {
        setNewIds(fresh);
        setTimeout(() => setNewIds(new Set()), 1200);
      }
      setInbox(data);
    } catch {
      /* keep last state */
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [session, refresh]);

  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const R = 26;
  const C = 2 * Math.PI * R;

  return (
    <div className="gradient-frame shadow-2xl shadow-brand/20">
      <div className="rounded-[24px] bg-white">
        {/* browser chrome */}
        <div className="flex items-center gap-2 rounded-t-[24px] border-b bg-gradient-to-r from-gray-50 to-white px-5 py-3">
          <span className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
          </span>
          <span className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-green-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Live inbox · auto-refreshing
          </span>
          <span className="w-10" />
        </div>

        {/* address + ring */}
        <div className="flex flex-col gap-4 border-b bg-gradient-to-br from-brand/5 via-white to-accent/5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Your temporary address
            </div>
            <button
              onClick={copy}
              disabled={!address}
              title="Click to copy"
              className="group mt-1 flex max-w-full items-center gap-2"
            >
              <span className="truncate font-mono text-xl font-bold text-gray-900 sm:text-2xl">
                {address ?? <span className="inline-block h-7 w-64 rounded skeleton align-middle" />}
              </span>
              {address && (
                <span className="shrink-0 rounded-md border px-2 py-1 text-xs text-gray-500 transition group-hover:border-brand group-hover:text-brand">
                  {copied ? '✓ Copied' : 'Copy'}
                </span>
              )}
            </button>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => bootstrap(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-dark disabled:opacity-50"
              >
                ↻ New address
              </button>
              <button
                onClick={refresh}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:-translate-y-0.5 hover:border-brand/40 hover:text-brand"
              >
                ⟳ Refresh
              </button>
            </div>
          </div>

          {/* circular countdown */}
          <div className="flex shrink-0 items-center gap-4">
            <div className="relative h-[68px] w-[68px]">
              <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
                <circle cx="32" cy="32" r={R} fill="none" stroke="#e5e7eb" strokeWidth="5" />
                <circle
                  cx="32"
                  cy="32"
                  r={R}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - fraction)}
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-sm font-bold text-gray-900">{countdown || '—'}</span>
                <span className="text-[9px] uppercase text-gray-400">left</span>
              </div>
            </div>
          </div>
        </div>

        {/* stats strip */}
        <div className="grid grid-cols-3 divide-x border-b text-center">
          <Stat label="Received" value={received} />
          <Stat label="Free limit" value={gateAfter} />
          <Stat label="Status" value={countdown === 'expired' ? 'Expired' : 'Active'} tone={countdown === 'expired' ? 'bad' : 'good'} />
        </div>

        {/* messages */}
        <ul className="max-h-[24rem] divide-y divide-gray-100 overflow-y-auto">
          {messages.length === 0 && (
            <li className="px-6 py-14 text-center">
              <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
                <span className="radar-ring absolute inline-block h-16 w-16 rounded-full bg-brand/30" />
                <span className="radar-ring absolute inline-block h-16 w-16 rounded-full bg-brand/30 [animation-delay:1.2s]" />
                <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-accent text-2xl text-white shadow-lg">
                  📡
                </span>
              </div>
              <p className="text-sm font-semibold text-gray-700">Listening for incoming mail…</p>
              <p className="mt-1 text-xs text-gray-400">
                Paste your address anywhere — messages land here in real time.
              </p>
            </li>
          )}
          {messages.map((m) => {
            const code = extractCode(m.subject, m.snippet);
            const isNew = newIds.has(m.id);
            const open = expanded === m.id;
            return (
              <li
                key={m.id}
                className={`px-4 py-3.5 transition ${isNew ? 'animate-fade-up bg-brand/5' : ''} ${m.isRead ? '' : 'bg-indigo-50/30'}`}
              >
                <button onClick={() => setExpanded(open ? null : m.id)} className="flex w-full gap-3 text-left">
                  <span
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: avatarColor(m.fromAddress) }}
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
                    <div className={`mt-0.5 text-xs text-gray-400 ${open ? '' : 'truncate'}`}>{m.snippet}</div>
                    {code && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(code);
                        }}
                        className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-1 font-mono text-sm font-bold text-green-700 ring-1 ring-green-200 transition hover:bg-green-100"
                      >
                        🔑 {code} <span className="text-[10px] font-normal text-green-500">tap to copy</span>
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        {/* gate CTA */}
        {inbox?.gated && (
          <div className="border-t bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 text-center text-sm">
            <strong className="text-amber-700">{withheld}</strong> more message
            {withheld === 1 ? '' : 's'} waiting — you&apos;ve reached the free limit of {gateAfter}.{' '}
            <a href="/signup" className="font-semibold text-brand underline-offset-2 hover:underline">
              Sign up free to unlock →
            </a>
          </div>
        )}

        {/* footer micro-CTA */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-b-[24px] border-t bg-gray-50/60 px-5 py-3 text-xs text-gray-500">
          <span>🔒 Private &amp; auto-expiring — no signup to start</span>
          <a href="/signup" className="font-semibold text-brand hover:underline">
            Make it permanent →
          </a>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'good' | 'bad';
}) {
  const c = tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="px-3 py-3">
      <div className={`text-lg font-bold ${c}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}
