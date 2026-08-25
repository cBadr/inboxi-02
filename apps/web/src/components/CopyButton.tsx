'use client';

import { useEffect, useRef, useState } from 'react';

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    // Clipboard access is refused outright in an insecure context or when the
    // permission is denied. Left unhandled the promise rejects and the button
    // simply never changes — indistinguishable from a broken button.
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1400);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`rounded border px-1.5 py-0.5 text-xs transition ${
        state === 'failed'
          ? 'border-red-200 text-red-600'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
      }`}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : (label ?? 'Copy')}
    </button>
  );
}
