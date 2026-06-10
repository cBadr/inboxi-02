'use client';

import { useMemo, useRef, useState } from 'react';

interface Attachment {
  filename: string;
  contentType?: string;
  contentBase64: string;
  size: number;
}

const TOTAL_ATTACHMENT_CAP = 7 * 1024 * 1024; // 7 MB total (binary)

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AdminComposerProps {
  domains: string[];
  /** Preselect a domain (e.g. when composing from a specific domain inbox). */
  defaultDomain?: string;
  /** Prefill a full from-address; overrides defaultDomain's local part. */
  defaultFrom?: string;
  defaultTo?: string;
  defaultSubject?: string;
  triggerLabel?: string;
  triggerClassName?: string;
}

type Mode = 'text' | 'html';

// Elegant slide-over composer. Builds the from-address from a local part + a
// locked domain selector, supports plain/HTML bodies, and posts to the shared
// authenticated send endpoint (admins may send from any active domain).
export function AdminComposer({
  domains,
  defaultDomain,
  defaultFrom,
  defaultTo = '',
  defaultSubject = '',
  triggerLabel = 'Compose',
  triggerClassName,
}: AdminComposerProps) {
  const [open, setOpen] = useState(false);

  const parsedFrom = defaultFrom?.includes('@') ? defaultFrom.split('@') : null;
  const initialLocal = parsedFrom ? parsedFrom[0]! : '';
  const initialDomain = parsedFrom ? parsedFrom[1]! : (defaultDomain ?? domains[0] ?? '');

  const [local, setLocal] = useState(initialLocal);
  const [domain, setDomain] = useState(initialDomain);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<Mode>('text');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    setStatus(null);
    const added: Attachment[] = [];
    let running = totalSize;
    for (const file of picked) {
      if (running + file.size > TOTAL_ATTACHMENT_CAP) {
        setStatus({ ok: false, msg: `Attachments exceed ${fmtSize(TOTAL_ATTACHMENT_CAP)} limit.` });
        break;
      }
      added.push({
        filename: file.name,
        contentType: file.type || undefined,
        contentBase64: await readFileAsBase64(file),
        size: file.size,
      });
      running += file.size;
    }
    setFiles((prev) => [...prev, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const fromAddress = useMemo(
    () => `${local.trim() || 'hello'}@${domain}`,
    [local, domain],
  );

  const reset = () => {
    setBody('');
    setFiles([]);
    setStatus(null);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const payload: Record<string, unknown> = { from: fromAddress, to, subject };
      payload[mode] = body;
      if (files.length > 0) {
        payload.attachments = files.map((f) => ({
          filename: f.filename,
          contentType: f.contentType,
          contentBase64: f.contentBase64,
        }));
      }
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus({ ok: true, msg: 'Message sent — delivered to the recipient.' });
        setBody('');
        setFiles([]);
      } else {
        setStatus({ ok: false, msg: humanError(data.error) });
      }
    } catch {
      setStatus({ ok: false, msg: 'Network error — please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          'inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark'
        }
      >
        <PenIcon />
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            onClick={() => !loading && setOpen(false)}
          />
          {/* panel */}
          <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">New message</h2>
                <p className="text-xs text-gray-500">Sending as administrator</p>
              </div>
              <button
                type="button"
                onClick={() => !loading && setOpen(false)}
                className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </header>

            <form onSubmit={send} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                {/* From — smart local part + locked domain */}
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    From
                  </label>
                  <div className="flex items-stretch overflow-hidden rounded-lg border focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
                    <input
                      value={local}
                      onChange={(e) => setLocal(e.target.value.replace(/\s+/g, ''))}
                      placeholder="hello"
                      className="min-w-0 flex-1 px-3 py-2 font-mono text-sm outline-none"
                    />
                    <span className="flex items-center bg-gray-50 px-2 font-mono text-sm text-gray-400">
                      @
                    </span>
                    <select
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      className="border-l bg-gray-50 px-2 py-2 font-mono text-sm text-gray-700 outline-none"
                    >
                      {domains.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    Any address works — provisioned or not. Will appear as{' '}
                    <span className="font-mono text-gray-500">{fromAddress}</span>
                  </p>
                </div>

                {/* To */}
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    To
                  </label>
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    required
                    type="email"
                    placeholder="recipient@example.com"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                </div>

                {/* Subject */}
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Subject
                  </label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="(no subject)"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                  />
                </div>

                {/* Body + format toggle */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
                      Message
                    </label>
                    <div className="flex rounded-md border p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setMode('text')}
                        className={`rounded px-2 py-0.5 transition ${mode === 'text' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        Plain
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode('html')}
                        className={`rounded px-2 py-0.5 transition ${mode === 'html' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        HTML
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={10}
                    placeholder={
                      mode === 'html' ? '<p>Write HTML here…</p>' : 'Write your message…'
                    }
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand ${mode === 'html' ? 'font-mono' : ''}`}
                  />
                </div>

                {/* Attachments */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-400">
                      Attachments
                    </label>
                    <span className="text-[11px] text-gray-400">
                      {files.length > 0 ? `${fmtSize(totalSize)} / ${fmtSize(TOTAL_ATTACHMENT_CAP)}` : `max ${fmtSize(TOTAL_ATTACHMENT_CAP)}`}
                    </span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={onPickFiles}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-sm text-gray-600 transition hover:border-brand hover:text-brand"
                  >
                    <ClipIcon /> Attach files
                  </button>
                  {files.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {files.map((f, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 rounded-lg border bg-gray-50 px-3 py-1.5 text-sm"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-brand/10 text-[9px] font-bold text-brand">
                            {(f.filename.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-gray-700">{f.filename}</span>
                          <span className="shrink-0 text-xs text-gray-400">{fmtSize(f.size)}</span>
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            className="shrink-0 text-gray-300 hover:text-red-500"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Footer */}
              <footer className="border-t bg-gray-50 px-6 py-4">
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <ShieldIcon /> DKIM-signed
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <LockIcon /> TLS delivery
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FilterIcon /> Spam-screened
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={loading || !to || !domain}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? 'Sending…' : 'Send message'}
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                  {status && (
                    <span
                      className={`ml-auto text-sm ${status.ok ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {status.msg}
                    </span>
                  )}
                </div>
              </footer>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function humanError(code?: string): string {
  switch (code) {
    case 'from_domain_not_available':
    case 'unknown_from_domain':
      return 'That domain is not active or available for sending.';
    case 'send_quota_exceeded':
      return 'Daily send quota reached.';
    case 'blocked_by_anti_abuse':
      return 'Message blocked by the spam filter.';
    case 'no_transport':
      return 'No sending transport configured (Admin → Sending).';
    case 'invalid_from':
      return 'The from-address is invalid.';
    default:
      return code ? `Failed: ${code}` : 'Failed to send.';
  }
}

/* — inline icons (no external deps) — */
function PenIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function FilterIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />
    </svg>
  );
}
function ClipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
