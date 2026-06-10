import Link from 'next/link';
import { prisma } from '@inboxi/db';
import { requireUser } from '@/lib/session';
import { getAvailableDomains } from '@/lib/domains';
import { NewMailboxForm } from '@/components/NewMailboxForm';
import { deleteMailbox } from '../actions';

export const dynamic = 'force-dynamic';

export default async function MailboxesPage() {
  const user = await requireUser();
  const [domains, mailboxes] = await Promise.all([
    getAvailableDomains(user.id),
    prisma.mailbox.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Mailboxes</h1>
      <p className="mt-1 text-sm text-gray-500">Create addresses and read their inboxes.</p>

      <div className="mt-4">
        <NewMailboxForm domains={domains.map((d) => ({ id: d.id, name: d.name }))} />
      </div>

      <ul className="mt-6 divide-y rounded-lg border bg-white">
        {mailboxes.length === 0 && (
          <li className="p-6 text-center text-sm text-gray-500">No mailboxes yet.</li>
        )}
        {mailboxes.map((m) => (
          <li key={m.id} className="flex items-center justify-between p-4">
            <div>
              <Link href={`/dashboard/mailboxes/${m.id}`} className="font-mono text-brand hover:underline">
                {m.address}
              </Link>
              <div className="text-xs text-gray-400">
                {m._count.messages} message{m._count.messages === 1 ? '' : 's'}
                {m.displayName ? ` · ${m.displayName}` : ''}
              </div>
            </div>
            <form action={deleteMailbox}>
              <input type="hidden" name="id" value={m.id} />
              <button className="text-sm text-red-500 hover:underline">Delete</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
