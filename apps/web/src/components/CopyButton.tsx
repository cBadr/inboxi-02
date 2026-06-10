'use client';

import { useState } from 'react';

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="rounded border px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-50"
    >
      {copied ? 'Copied' : (label ?? 'Copy')}
    </button>
  );
}
