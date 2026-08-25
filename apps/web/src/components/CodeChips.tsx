'use client';

import { useEffect, useRef, useState } from 'react';

type Status = { code: string; state: 'copied' | 'failed' };

// Verification codes are the reason most people open a temp-mail message at
// all, so they get their own band above the body instead of being buried in
// whatever layout the sender chose.
export function CodeChips({ codes }: { codes: string[] }) {
  const [status, setStatus] = useState<Status | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  if (codes.length === 0) return null;

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setStatus({ code, state: 'copied' });
    } catch {
      // Clipboard access can be refused outright (insecure context, denied
      // permission). Saying so beats a button that silently does nothing.
      setStatus({ code, state: 'failed' });
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus(null), 1800);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-green-800">
        {codes.length === 1 ? 'Code' : 'Codes'}
      </span>

      {codes.map((code) => {
        const current = status?.code === code ? status.state : null;
        return (
          <button
            key={code}
            type="button"
            onClick={() => copy(code)}
            title={`Copy ${code}`}
            className={`group inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-base font-bold tracking-wider transition ${
              current === 'failed'
                ? 'border-red-300 bg-red-50 text-red-700'
                : 'border-green-300 bg-white text-green-800 hover:border-green-400 hover:bg-green-50'
            }`}
          >
            {code}
            <span
              aria-hidden="true"
              className="font-sans text-xs font-medium text-green-600 group-hover:text-green-700"
            >
              {current === 'copied' ? '✓' : current === 'failed' ? '✕' : '⧉'}
            </span>
          </button>
        );
      })}

      {/* Announced to screen readers, and visible confirmation for everyone
          else — a copy button that gives no sign is indistinguishable from a
          broken one. */}
      <span role="status" aria-live="polite" className="text-xs font-medium text-green-700">
        {status?.state === 'copied'
          ? 'Copied to clipboard'
          : status?.state === 'failed'
            ? 'Could not copy — select the code and press Ctrl+C'
            : ''}
      </span>
    </div>
  );
}
