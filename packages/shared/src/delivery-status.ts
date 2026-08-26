/**
 * What a successful hand-off actually proves, per transport.
 *
 * The platform used to record SENT the moment nodemailer's promise resolved.
 * Against a SELF_HOST transport that promise resolves on the *local* Haraka
 * answering 250 for its own spool — before any remote server has been
 * contacted. Production reached 272,482 rows marked SENT with 254,000 of those
 * messages still sitting on disk, and the dashboard reported a 100% success
 * rate throughout. A status is a claim; this module decides which claims the
 * evidence supports.
 */
export type HandoffKind = 'SELF_HOST' | 'SMTP_RELAY' | 'TEST_STREAM' | null;

/** The subset of OutboundStatus this decision can produce. */
export type RecordedStatus = 'SENT' | 'QUEUED' | 'FAILED';

export function statusForHandoff(kind: HandoffKind, ok: boolean): RecordedStatus {
  if (!ok) return 'FAILED';
  switch (kind) {
    // Accepted by our own spool. Nothing external has seen it yet.
    case 'SELF_HOST':
      return 'QUEUED';
    // A third party took responsibility for onward delivery, which is what
    // "sent" means everywhere else in mail.
    case 'SMTP_RELAY':
      return 'SENT';
    // A dry run that never leaves the process; only ever injected outside
    // production, where calling it sent keeps local flows workable.
    case 'TEST_STREAM':
      return 'SENT';
    // Unknown transport: claim the weaker thing.
    default:
      return 'QUEUED';
  }
}

/** Only a SENT message has genuinely been sent, so only it carries a sentAt. */
export function sentAtForStatus(status: RecordedStatus, now: Date = new Date()): Date | null {
  return status === 'SENT' ? now : null;
}

/**
 * Pull the MTA's own queue id out of its 250 reply — Haraka answers with
 * something like `250 Message Queued (abc123)`. Storing it is what makes a
 * QUEUED row traceable to a file in the spool later.
 */
export function parseQueueId(response: string | undefined | null): string | null {
  if (!response) return null;
  const parenthesised = /\(([^)]{4,120})\)/.exec(response);
  if (parenthesised?.[1]) return parenthesised[1].trim();
  const queued = /queued(?:\s+as)?\s+([A-Za-z0-9._-]{4,120})/i.exec(response);
  return queued?.[1] ?? null;
}
