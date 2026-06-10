import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { extractOtp } from '@inboxi/shared';
import { requireUser } from '@/lib/session';
import { setForwarding } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function MailboxInboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const mailbox = await prisma.mailbox.findUnique({ where: { id } });
  if (!mailbox || mailbox.userId !== user.id) notFound();

  const messages = await prisma.message.findMany({
    where: { mailboxId: mailbox.id },
    orderBy: { receivedAt: 'desc' },
    take: 100,
  });

  return (
    <div>
      <Link href="/dashboard/mailboxes" className="text-sm text-gray-500 hover:text-brand">
        ← Mailboxes
      </Link>
      <h1 className="mt-2 font-mono text-xl font-bold">{mailbox.address}</h1>

      <form action={setForwarding} className="mt-3 flex items-center gap-2 text-sm">
        <input type="hidden" name="id" value={mailbox.id} />
        <span className="text-gray-500">Forward to:</span>
        <input
          name="forwardTo"
          type="email"
          defaultValue={mailbox.forwardTo ?? ''}
          placeholder="real@address.com (blank to disable)"
          className="w-64 rounded border px-2 py-1"
        />
        <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50">Save</button>
      </form>

      <ul className="mt-4 divide-y rounded-lg border bg-white">
        {messages.length === 0 && (
          <li className="p-8 text-center text-sm text-gray-500">Inbox empty.</li>
        )}
        {messages.map((m) => (
          <li key={m.id} className={m.isRead ? '' : 'bg-indigo-50/40'}>
            <Link
              href={`/dashboard/mailboxes/${mailbox.id}/${m.id}`}
              className="block p-4 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{m.fromAddress}</span>
                <span className="text-xs text-gray-400">
                  {new Date(m.receivedAt).toLocaleString()}
                </span>
              </div>
              <div className="text-sm">{m.subject || '(no subject)'}</div>
              {(() => {
                const otp = extractOtp({ subject: m.subject ?? undefined, text: m.textBody ?? undefined });
                return otp ? (
                  <div className="mt-1 inline-block rounded bg-green-100 px-2 py-0.5 font-mono text-sm text-green-800">
                    Code: {otp.code}
                  </div>
                ) : null;
              })()}
              {m.snippet && <div className="mt-1 text-xs text-gray-500">{m.snippet}</div>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
