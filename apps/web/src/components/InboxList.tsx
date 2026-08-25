'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { avatarColor, initials, senderName } from '@/lib/sender-display';

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
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>('inbox');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // The open message is read from the URL rather than held in state: the reading
  // pane is a real route, so a refresh, a shared link and the browser's back
  // button all keep working.
  const activeId = useMemo(() => {
    const prefix = `${basePath}/`;
    if (!pathname.startsWith(prefix)) return null;
    return pathname.slice(prefix.length).split('/')[0] || null;
  }, [pathname, basePath]);

  // Opening a message marks it read on the server, but this list lives in the
  // layout and is not re-rendered by that navigation — so the row would stay
  // bold right next to the message the reader is looking at. Mirror the write
  // locally until the next server refresh replaces it with the real value.
  const [locallyRead, setLocallyRead] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!activeId) return;
    setLocallyRead((prev) => (prev.has(activeId) ? prev : new Set(prev).add(activeId)));
  }, [activeId]);

  const readOf = useCallback(
    (m: InboxMessage) => m.isRead || locallyRead.has(m.id),
    [locallyRead],
  );

  const counts = useMemo(
    () => ({
      inbox: messages.filter((m) => !m.isArchived).length,
      unread: messages.filter((m) => !m.isArchived && !readOf(m)).length,
      starred: messages.filter((m) => m.isStarred && !m.isArchived).length,
      archived: messages.filter((m) => m.isArchived).length,
    }),
    [messages, readOf],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => {
      if (tab === 'inbox' && m.isArchived) return false;
      // The message being read stays in the Unread tab until the reader moves
      // on, so the row does not vanish from under the pane they just opened.
      if (tab === 'unread' && (m.isArchived || (readOf(m) && m.id !== activeId))) return false;
      if (tab === 'starred' && (!m.isStarred || m.isArchived)) return false;
      if (tab === 'archived' && !m.isArchived) return false;
      if (!q) return true;
      return (
        m.fromAddress.toLowerCase().includes(q) ||
        (m.subject ?? '').toLowerCase().includes(q) ||
        (m.snippet ?? '').toLowerCase().includes(q)
      );
    });
  }, [messages, tab, query, readOf, activeId]);

  // Keyboard navigation through the reading pane: ↑/↓ (or k/j) step through the
  // visible list, Esc closes the message. Typing in the search box is exempt.
  const step = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const current = activeId ? visible.findIndex((m) => m.id === activeId) : -1;
      const next = current === -1 ? (delta > 0 ? 0 : visible.length - 1) : current + delta;
      const target = visible[Math.max(0, Math.min(visible.length - 1, next))];
      if (target) router.push(`${basePath}/${target.id}`);
    },
    [visible, activeId, basePath, router],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;

      if (event.key === 'ArrowDown' || event.key === 'j') {
        event.preventDefault();
        step(1);
      } else if (event.key === 'ArrowUp' || event.key === 'k') {
        event.preventDefault();
        step(-1);
      } else if (event.key === 'Escape' && activeId) {
        event.preventDefault();
        router.push(basePath);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, activeId, basePath, router]);

  const allVisibleSelected = visible.length > 0 && visible.every((m) => selected.has(m.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((m) => m.id)));

  // A server action that throws inside a transition disappears silently and the
  // row keeps showing the old state — which reads as "it worked". Say so
  // instead, and still refresh so the list matches the server either way.
  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
      } catch {
        setError('That action did not go through. Nothing was changed — try again.');
      }
      setSelected(new Set());
      // The refresh brings the authoritative read state back; drop the local
      // mirror so "mark unread" is not overridden by it.
      setLocallyRead(new Set());
      router.refresh();
    });

  const ids = () => [...selected];
  const selectedAllArchived = ids().every((id) => messages.find((m) => m.id === id)?.isArchived);

  // A deleted or archived-away message can leave the pane pointing at nothing;
  // send the reader back to the list instead of a dead route.
  const closeIfActive = (removedIds: string[]) => {
    if (activeId && removedIds.includes(activeId)) router.push(basePath);
  };

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'inbox', label: 'Inbox' },
    { key: 'unread', label: 'Unread' },
    { key: 'starred', label: 'Starred' },
    { key: 'archived', label: 'Archived' },
  ];

  return (
    // On phones the list and the reading pane share one column, so the list
    // steps aside while a message is open.
    <div
      className={`overflow-hidden rounded-xl border bg-white ${activeId ? 'hidden md:block' : ''}`}
    >
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

      {error && (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">
            Dismiss
          </button>
        </div>
      )}

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
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const target = ids();
              run(() => actions.setArchived(scopeId, target, !selectedAllArchived));
            }}
            className={barBtn}
          >
            {selectedAllArchived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const target = ids();
              if (confirm(`Delete ${target.length} message(s)? This cannot be undone.`)) {
                closeIfActive(target);
                run(() => actions.remove(scopeId, target));
              }
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
          <span className="ml-auto hidden lg:inline">↑↓ move · esc close</span>
        </div>
      )}

      {/* list */}
      {visible.length === 0 ? (
        <div className="p-12 text-center text-sm text-gray-500">
          {query ? 'No messages match your search.' : 'Nothing here.'}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 md:max-h-[calc(100vh-14rem)] md:overflow-y-auto">
          {visible.map((m) => {
            const isActive = m.id === activeId;
            const isRead = readOf(m);
            return (
              <li
                key={m.id}
                className={`group relative flex items-center gap-3 px-4 py-3 transition hover:bg-gray-50 ${isRead ? '' : 'bg-indigo-50/30'} ${selected.has(m.id) ? 'bg-indigo-50/60' : ''} ${isActive ? 'bg-brand/10 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-brand hover:bg-brand/10' : ''}`}
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

                {/* Opens in the reading pane beside the list — not a new tab. */}
                <Link
                  href={`${basePath}/${m.id}`}
                  scroll={false}
                  aria-current={isActive ? 'true' : undefined}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-sm ${isRead ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>
                      {senderName(m.fromAddress)}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">{timeAgo(m.receivedAt)}</span>
                  </div>
                  <div className={`truncate text-sm ${isRead ? 'text-gray-600' : 'text-gray-900'}`}>
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
                    {m.snippet && <span className="truncate text-gray-500">{m.snippet}</span>}
                  </div>
                </Link>

                <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <a href={`${basePath}/${m.id}`} target="_blank" rel="noreferrer" title="Open in new tab" className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand">
                    ↗
                  </a>
                  <button type="button" title={isRead ? 'Mark unread' : 'Mark read'} disabled={pending} onClick={() => run(() => actions.setRead(scopeId, [m.id], !isRead))} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand">
                    {isRead ? '○' : '●'}
                  </button>
                  <button type="button" title={m.isArchived ? 'Unarchive' : 'Archive'} disabled={pending} onClick={() => run(() => actions.setArchived(scopeId, [m.id], !m.isArchived))} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand">
                    🗄
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    disabled={pending}
                    onClick={() => {
                      if (confirm('Delete this message?')) {
                        closeIfActive([m.id]);
                        run(() => actions.remove(scopeId, [m.id]));
                      }
                    }}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    🗑
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const barBtn = 'rounded-md border bg-white px-2.5 py-1 text-gray-600 hover:bg-gray-50 disabled:opacity-50';

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
