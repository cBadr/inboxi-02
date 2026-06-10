'use client';

import { useState } from 'react';
import type { ConnectionInfo as ConnInfo } from '@/lib/mail-connection';

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="rounded p-1 text-gray-300 transition hover:bg-gray-100 hover:text-gray-600"
      title="Copy"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="flex items-center gap-1">
        <span className={`text-sm text-gray-700 ${mono ? 'font-mono' : ''}`}>{value}</span>
        <CopyChip value={value} />
      </span>
    </div>
  );
}

const PROTOCOL_ACCENT: Record<string, string> = {
  SMTP: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  IMAP: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  POP3: 'bg-amber-50 text-amber-700 ring-amber-200',
};

export function ConnectionInfo({ info }: { info: ConnInfo }) {
  const [open, setOpen] = useState(false);
  const { limits } = info;

  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-10 5L2 7" />
            </svg>
          </span>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Mailbox connection & limits</h3>
            <p className="text-xs text-gray-500">
              SMTP / IMAP / POP3 settings, message size, send &amp; receive quotas
            </p>
          </div>
        </div>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="border-t px-5 py-5">
          {/* protocols */}
          <div className="grid gap-4 md:grid-cols-3">
            {info.protocols.map((p) => (
              <div key={p.protocol} className="rounded-lg border bg-gray-50/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${PROTOCOL_ACCENT[p.protocol]}`}
                  >
                    {p.protocol}
                  </span>
                </div>
                <p className="mb-2 text-xs text-gray-500">{p.purpose}</p>
                <div className="divide-y divide-gray-100">
                  <Field label="Server" value={p.host} />
                  {p.ports.map((port) => (
                    <Field
                      key={port.port}
                      label={`Port${port.recommended ? ' (recommended)' : ''}`}
                      value={`${port.port} · ${port.security}`}
                      mono={false}
                    />
                  ))}
                  <Field label="Username" value={p.username} />
                </div>
                <p className="mt-2 text-[11px] leading-snug text-gray-400">{p.authNote}</p>
              </div>
            ))}
          </div>

          {/* limits */}
          <div className="mt-5">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Account limits &amp; authentication
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Max size" value={`${limits.maxMessageSizeMb} MB`} />
              <Stat
                label="Daily send"
                value={limits.dailySendQuota > 0 ? String(limits.dailySendQuota) : '—'}
              />
              <Stat label="Daily receive" value={String(limits.dailyReceiveQuota)} />
              <Stat label="Retention" value={`${limits.retentionDays}d`} />
              <Stat
                label="DKIM"
                value={limits.dkimSigned ? 'Signed' : 'Off'}
                tone={limits.dkimSigned ? 'good' : 'warn'}
              />
              <Stat label="DMARC" value={limits.dmarcPolicy} />
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Send/receive quotas shown are the free-tier baseline; paid plans raise them.
              Webmail access is always available at{' '}
              <span className="font-mono text-gray-500">{info.webmail}</span>.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'warn';
}) {
  const toneCls =
    tone === 'good' ? 'text-green-600' : tone === 'warn' ? 'text-amber-600' : 'text-gray-900';
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`text-sm font-semibold capitalize ${toneCls}`}>{value}</div>
    </div>
  );
}
