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
  const [soundOn, setSoundOn] = useState(true);
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const soundOnRef = useRef(true);
  const audioCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem('inboxi.sound');
      if (v !== null) setSoundOn(v === '1');
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  const toggleSound = () =>
    setSoundOn((v) => {
      const n = !v;
      try {
        localStorage.setItem('inboxi.sound', n ? '1' : '0');
      } catch {
        /* ignore */
      }
      return n;
    });

  // Pleasant two-note chime synthesised with the Web Audio API (no asset file).
  const playChime = () => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx.current) audioCtx.current = new Ctx();
      const ac = audioCtx.current;
      if (ac.state === 'suspended') void ac.resume();
      const now = ac.currentTime;
      [880, 1318.5].forEach((freq, i) => {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ac.destination);
        const t = now + i * 0.13;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        osc.start(t);
        osc.stop(t + 0.32);
      });
    } catch {
      /* audio blocked — ignore */
    }
  };

  const address = inbox?.address ?? session?.address ?? null;
  const expiresAt = inbox?.expiresAt ?? session?.expiresAt ?? null;
  const gateAfter = session?.gateAfter ?? inbox?.gateAfter ?? 3;
  const { label: countdown, ms: remainingMs } = useRemaining(expiresAt);
  const expired = !!expiresAt && remainingMs <= 0;
  const urgent = remainingMs > 0 && remainingMs < 5 * 60_000; // < 5 min

  const messages = inbox?.messages ?? [];
  const withheld = inbox?.withheldCount ?? 0;
  const received = messages.length + withheld;

  const bootstrap = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/anon/session', { method: 'POST' });
      if (res.ok) setSession((await res.json()) as SessionResponse);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, []);

  // After expiry, requesting a session mints a brand-new address (one per visitor).
  const getNewAddress = useCallback(async () => {
    seenIds.current = new Set();
    setInbox(null);
    setExpanded(null);
    await bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/anon/messages', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as InboxResponse;
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
        // Chime only for messages that arrive after the first load.
        if (initialized.current && soundOnRef.current) playChime();
      }
      initialized.current = true;
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

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-2xl shadow-brand/10 ring-1 ring-gray-200/70">
      {/* gradient header band */}
      <div className="flex items-center justify-between bg-gradient-to-r from-brand to-accent px-5 py-3 text-white">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-white/80" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          Live inbox
        </span>
        <button
          onClick={toggleSound}
          title={soundOn ? 'Mute new-mail sound' : 'Unmute new-mail sound'}
          aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
          className="rounded-full bg-white/15 px-2 py-1 text-sm transition hover:bg-white/25"
        >
          {soundOn ? '🔔' : '🔕'}
        </button>
      </div>

      {/* address panel */}
      <div className="border-b bg-gray-50/70 p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Your temporary address
        </div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center rounded-xl border bg-white px-3 py-2.5 shadow-sm">
            <span className="truncate font-mono text-base font-bold text-gray-900 sm:text-lg">
              {address ?? <span className="inline-block h-6 w-56 rounded skeleton align-middle" />}
            </span>
          </div>
          <button
            onClick={copy}
            disabled={!address}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-dark disabled:opacity-50"
          >
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>

        {/* motivational countdown */}
        <div
          className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm ${
            expired
              ? 'bg-red-50 text-red-700'
              : urgent
                ? 'bg-amber-50 text-amber-800'
                : 'bg-brand/5 text-gray-700'
          }`}
        >
          {expired ? (
            <>
              <span>⌛ This address has expired.</span>
              <button
                onClick={getNewAddress}
                disabled={busy}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                Get a new free address
              </button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-2">
                <span>{urgent ? '🔥' : '⏳'} Self-destructs in</span>
                <span className={`font-mono text-base font-extrabold ${urgent ? 'text-amber-700' : 'text-brand'}`}>
                  {countdown || '—'}
                </span>
              </span>
              <a href="/signup" className="font-semibold text-brand underline-offset-2 hover:underline">
                Keep it forever — sign up free →
              </a>
            </>
          )}
        </div>
      </div>

      {/* stats strip */}
      <div className="grid grid-cols-3 divide-x border-b text-center">
        <Stat label="Received" value={received} />
        <Stat label="Free limit" value={gateAfter} />
        <Stat label="Status" value={expired ? 'Expired' : 'Active'} tone={expired ? 'bad' : 'good'} />
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-gray-50/60 px-5 py-3 text-xs text-gray-500">
        <span>🔒 Private &amp; auto-expiring — no signup to start</span>
        <a href="/signup" className="font-semibold text-brand hover:underline">
          Make it permanent →
        </a>
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
