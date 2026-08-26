import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { requireUser } from '@/lib/session';
import { folderChipClass } from '@/lib/folders';
import { senderName, initials, avatarColor } from '@/lib/sender-display';
import { unfileMessages } from '../../folder-actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

// A folder belongs to the user, not to one address — so this is the only screen
// that can keep the promise the feature makes. The chips inside a mailbox can
// only ever filter that mailbox's own messages; here the folder is shown whole,
// across every address its owner has.
export default async function FolderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1);

  const folder = await prisma.folder.findFirst({ where: { id, userId: user.id } });
  if (!folder) notFound();

  // Scoped through the mailbox owner rather than by folder alone: filing is
  // per-user, and a message must still belong to this user to be listed.
  const where = { folderId: folder.id, mailbox: { userId: user.id } };

  const [total, rows] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fromAddress: true,
        toAddress: true,
        subject: true,
        snippet: true,
        receivedAt: true,
        isRead: true,
        mailboxId: true,
      },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/folders" className="text-sm text-gray-500 hover:text-brand">
          ← Folders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{folder.name}</h1>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${folderChipClass(folder.color)}`}
          >
            {total} message{total === 1 ? '' : 's'}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Everything you filed here, from every one of your addresses.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">
            Nothing filed here yet. Select messages in a mailbox and use “Move to…”.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((m) => (
              <li
                key={m.id}
                className={`flex items-center gap-3 px-4 py-3 ${m.isRead ? '' : 'bg-indigo-50/30'}`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: avatarColor(m.fromAddress) }}
                >
                  {initials(m.fromAddress)}
                </span>
                <Link
                  href={
                    m.mailboxId
                      ? `/dashboard/mailboxes/${m.mailboxId}/${m.id}`
                      : '/dashboard/folders'
                  }
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-sm ${m.isRead ? 'text-gray-700' : 'font-semibold text-gray-900'}`}
                    >
                      {senderName(m.fromAddress)}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500">
                      {m.receivedAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <div className="truncate text-sm text-gray-600">
                    {m.subject || '(no subject)'}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-gray-500">
                    to {m.toAddress}
                  </div>
                </Link>
                <form action={unfileMessages}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="folderId" value={folder.id} />
                  <button className="shrink-0 rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50">
                    Unfile
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Page {page} of {pages} · {total} total
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/dashboard/folders/${folder.id}?page=${page - 1}`}
                className="rounded border px-3 py-1 hover:bg-gray-50"
              >
                Previous
              </Link>
            )}
            {page < pages && (
              <Link
                href={`/dashboard/folders/${folder.id}?page=${page + 1}`}
                className="rounded border px-3 py-1 hover:bg-gray-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
