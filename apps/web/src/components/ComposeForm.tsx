'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export function ComposeForm({ domains }: { domains: string[] }) {
  const params = useSearchParams();
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const [subject, setSubject] = useState(params.get('subject') ?? '');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ from, to, subject, text: body }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus({ ok: true, msg: 'Message sent ✓' });
        setBody('');
      } else {
        setStatus({ ok: false, msg: humanError(data.error) });
      }
    } catch {
      setStatus({ ok: false, msg: 'Network error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={send} className="space-y-3 rounded-lg border bg-white p-5">
      <label className="block text-sm">
        <span className="text-gray-600">From (any address on your domain)</span>
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          required
          placeholder={domains[0] ? `me@${domains[0]}` : 'me@yourdomain.com'}
          className="mt-1 w-full rounded border px-3 py-2 font-mono text-sm"
          list="domains"
        />
        <datalist id="domains">
          {domains.map((d) => (
            <option key={d} value={`@${d}`} />
          ))}
        </datalist>
        {domains.length > 0 && (
          <span className="mt-1 block text-xs text-gray-400">
            Your domains: {domains.join(', ')}
          </span>
        )}
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">To</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
          type="email"
          placeholder="recipient@example.com"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">Subject</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="text-gray-600">Message</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-brand px-4 py-2 text-sm text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
        {status && (
          <span className={status.ok ? 'text-sm text-green-600' : 'text-sm text-red-600'}>
            {status.msg}
          </span>
        )}
      </div>
    </form>
  );
}

function humanError(code?: string): string {
  switch (code) {
    case 'from_domain_not_available':
    case 'unknown_from_domain':
      return 'You can only send from a domain you control.';
    case 'send_quota_exceeded':
      return 'Daily send quota reached.';
    case 'blocked_by_anti_abuse':
      return 'Message blocked by spam filter.';
    case 'no_transport':
      return 'No sending transport configured (admin → Sending).';
    default:
      return code ? `Failed: ${code}` : 'Failed to send.';
  }
}
