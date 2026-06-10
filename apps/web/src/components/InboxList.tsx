'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export interface InboxMessage {
  id: string;
  fromAddress: string;
  toAddress: string;
  subject: string | null;
  snippet: string | null;
  receivedAt: string;
  isRead: boolean;
  isArchived: boolean;
  isStarred: boolean;
  isCatchAll: boolean;
  attachments: number;
  otpCode: string | null;
}

// Server actions are bound to a scope (a domain for admins, a mailbox for users).
export interface InboxActions {
  setArchived: (scopeId: string, ids: string[], archived: boolean) => Promise<void>;
  setRead: (scopeId: string, ids: string[], read: boolean) => Promise<void>;
  setStarred: (scopeId: string, ids: string[], starred: boolean) => Promise<void>;
  remove: (scopeId: string, ids: string[]) => Promise<void>;
}

type Tab = 'inbox' | 'unread' | 'starred' | 'archived';

export function InboxList({
  scopeId,
  basePath,
  messages,
  actions,
}: {
  scopeId: string;
  basePath: string; // message links are `${basePath}/${id}`
  messages: InboxMessage[];
  actions: InboxActions;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>('inbox');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const counts = useMemo(
    () => ({
      inbox: messages.filter((m) => !m.isArchived).length,
      unread: messages.filter((m) => !m.isArchived && !m.isRead).length,
      starred: messages.filter((m) => m.isStarred && !m.isArchived).length,
      archived: messages.filter((m) => m.isArchived).length,
    }),
    [messages],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => {
      if (tab === 'inbox' && m.isArchived) return false;
      if (tab === 'unread' && (m.isArchived || m.isRead)) return false;
      if (tab === 'starred' && (!m.isStarred || m.isArchived)) return false;
      if (tab === 'archived' && !m.isArchived) return false;
      if (!q) return true;
      return (
        m.fromAddress.toLowerCase().includes(q) ||
        (m.subject ?? '').toLowerCase().includes(q) ||
        (m.snippet ?? '').toLowerCase().includes(q)
      );
    });
  }, [messages, tab, query]);

  const allVisibleSelected = visible.length > 0 && visible.every((m) => selected.has(m.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((m) => m.id)));

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      setSelected(new Set());
      router.refresh();
    });

  const ids = () => [...selected];
  const selectedAllArchived = ids().every((id) => messages.find((m) => m.id === id)?.isArchived);

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'inbox', label: 'Inbox' },
    { key: 'unread', label: 'Unread' },
    { key: 'starred', label: 'Starred' },
    { key: 'archived', label: 'Archived' },
  ];

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="flex rounded-lg border p-0.5 text-sm">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1 transition ${tab === t.key ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.label}
              <span className={`ml-1 text-xs ${tab === t.key ? 'text-white/80' : 'text-gray-400'}`}>
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sender, subject…"
          className="ml-auto w-56 rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      {/* bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-indigo-50/40 px-4 py-2 text-sm">
          <span className="font-medium text-gray-700">{selected.size} selected</span>
          <button type="button" disabled={pending} onClick={() => run(() => actions.setRead(scopeId, ids(), true))} className={barBtn}>
            Mark read
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => actions.setRead(scopeId, ids(), false))} className={barBtn}>
            Mark unread
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => actions.setArchived(scopeId, ids(), !selectedAllArchived))} className={barBtn}>
            {selectedAllArchived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete ${selected.size} message(s)? This cannot be undone.`))
                run(() => actions.remove(scopeId, ids()));
            }}
            className="rounded-md border border-red-200 px-2.5 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-gray-500 hover:text-gray-700">
            Clear
          </button>
        </div>
      )}

      {/* select-all row */}
      {visible.length > 0 && (
        <div className="flex items-center gap-3 border-b bg-gray-50/60 px-4 py-2 text-xs text-gray-500">
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="h-3.5 w-3.5" />
          <span>Select all ({visible.length})</span>
        </div>
      )}

      {/* list */}
      {visible.length === 0 ? (
        <div className="p-12 text-center text-sm text-gray-500">
          {query ? 'No messages match your search.' : 'Nothing here.'}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {visible.map((m) => (
            <li
              key={m.id}
              className={`group flex items-center gap-3 px-4 py-3 transition hover:bg-gray-50 ${m.isRead ? '' : 'bg-indigo-50/30'} ${selected.has(m.id) ? 'bg-indigo-50/60' : ''}`}
            >
              <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="h-3.5 w-3.5 shrink-0" />
              <button
                type="button"
                title={m.isStarred ? 'Unstar' : 'Star'}
                disabled={pending}
                onClick={() => run(() => actions.setStarred(scopeId, [m.id], !m.isStarred))}
                className={`shrink-0 ${m.isStarred ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400'}`}
              >
                {m.isStarred ? '★' : '☆'}
              </button>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: avatarColor(m.fromAddress) }}
              >
                {initials(m.fromAddress)}
              </span>

              <a href={`${basePath}/${m.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${m.isRead ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                    {senderName(m.fromAddress)}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">{timeAgo(m.receivedAt)}</span>
                </div>
                <div className={`truncate text-sm ${m.isRead ? 'text-gray-600' : 'text-gray-900'}`}>
                  {m.subject || '(no subject)'}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {m.isCatchAll && (
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700">catch-all</span>
                  )}
                  {m.attachments > 0 && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">📎 {m.attachments}</span>
                  )}
                  {m.otpCode && (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 font-mono font-semibold text-green-800">
                      Code {m.otpCode}
                    </span>
                  )}
                  {m.snippet && <span className="truncate text-gray-400">{m.snippet}</span>}
                </div>
              </a>

              <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <a href={`${basePath}/${m.id}`} target="_blank" rel="noreferrer" title="Open in new tab" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand">
                  ↗
                </a>
                <button type="button" title={m.isRead ? 'Mark unread' : 'Mark read'} disabled={pending} onClick={() => run(() => actions.setRead(scopeId, [m.id], !m.isRead))} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand">
                  {m.isRead ? '○' : '●'}
                </button>
                <button type="button" title={m.isArchived ? 'Unarchive' : 'Archive'} disabled={pending} onClick={() => run(() => actions.setArchived(scopeId, [m.id], !m.isArchived))} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand">
                  🗄
                </button>
                <button
                  type="button"
                  title="Delete"
                  disabled={pending}
                  onClick={() => {
                    if (confirm('Delete this message?')) run(() => actions.remove(scopeId, [m.id]));
                  }}
                  className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const barBtn = 'rounded-md border bg-white px-2.5 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-50';

function senderName(addr: string): string {
  const local = addr.split('@')[0] ?? addr;
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function initials(addr: string): string {
  const name = senderName(addr).trim();
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (addr[0] ?? '?').toUpperCase();
}
const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
function avatarColor(addr: string): string {
  let h = 0;
  for (let i = 0; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}
function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
