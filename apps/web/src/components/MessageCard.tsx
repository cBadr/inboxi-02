import Link from 'next/link';
import { AttachmentList, type AttachmentView } from './AttachmentList';
import { MessageBody } from './MessageBody';
import { CodeChips } from './CodeChips';
import { LocalTime } from './LocalTime';
import { CopyButton } from './CopyButton';
import { avatarColor, formatBytes, initials, senderName } from '@/lib/sender-display';

export interface MessageCardProps {
  subject: string | null;
  fromAddress: string;
  toAddress: string;
  receivedAt: string; // ISO
  sizeBytes?: number | null;
  isSpam?: boolean;
  html: string | null;
  text: string | null;
  codes: string[];
  attachments: AttachmentView[];
  actions?: React.ReactNode;
  backHref: string;
  backLabel: string;
}

// One message chrome for both inboxes. The user page and the admin page had
// drifted into two different designs for the same object — same data, different
// hierarchy, different polish — so the shape now lives here and each page only
// supplies its own action buttons.
export function MessageCard({
  subject,
  fromAddress,
  toAddress,
  receivedAt,
  sizeBytes,
  isSpam,
  html,
  text,
  codes,
  attachments,
  actions,
  backHref,
  backLabel,
}: MessageCardProps) {
  return (
    <div>
      {/* The list is already beside the pane on desktop; this only earns its
          keep on phones, where the list steps aside. */}
      <Link
        href={backHref}
        className="mb-3 inline-block text-sm text-gray-500 transition hover:text-brand lg:hidden"
      >
        ← {backLabel}
      </Link>

      <article className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <header className="border-b px-4 py-4 sm:px-6 sm:py-5">
          {/* The subject owns its own line. Sharing a flex row with a shrink-0
              action bar cost it everything: measured on the live site, the bar
              took 393px of a 439px row and the subject rendered 30px wide —
              one character per line. Wrapping, never truncating: a clipped
              subject is the one part of a message you cannot recover by
              reading on. */}
          <h1 className="break-words text-lg font-semibold tracking-tight text-gray-900 sm:text-xl">
            {subject || <span className="text-gray-500">(no subject)</span>}
          </h1>

          <div className="mt-3 flex flex-wrap items-start gap-x-3 gap-y-2">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: avatarColor(fromAddress) }}
            >
              {initials(fromAddress)}
            </span>

            {/* basis-48 keeps the sender readable and pushes the timestamp to
                its own line rather than letting it squeeze this to nothing. */}
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-gray-900">{senderName(fromAddress)}</span>
                <span className="break-all font-mono text-xs text-gray-500">
                  &lt;{fromAddress}&gt;
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                <span className="min-w-0">
                  to <span className="break-all font-mono text-gray-600">{toAddress}</span>
                </span>
                <CopyButton value={toAddress} label="Copy address" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <LocalTime iso={receivedAt} />
              {typeof sizeBytes === 'number' && sizeBytes > 0 && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5">{formatBytes(sizeBytes)}</span>
              )}
              {isSpam && (
                <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-600">
                  spam
                </span>
              )}
            </div>
          </div>

          {actions && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">{actions}</div>
          )}
        </header>

        {/* Codes sit above the body on purpose: for most temp-mail readers they
            are the entire reason the message was opened. */}
        {codes.length > 0 && (
          <div className="border-b border-green-200 bg-green-50/70 px-4 py-3 sm:px-6">
            <CodeChips codes={codes} />
          </div>
        )}

        <div className="px-4 py-4 sm:px-6">
          <MessageBody html={html} text={text} />
        </div>

        {attachments.length > 0 && (
          <div className="border-t bg-gray-50/60 px-4 py-4 sm:px-6">
            <AttachmentList attachments={attachments} />
          </div>
        )}
      </article>
    </div>
  );
}
