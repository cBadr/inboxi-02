// Policy for destructive domain operations.
//
// Deleting a domain cascades its mailboxes and every message in them, so the
// rule that decides whether a delete may proceed — and the sentence shown when
// it may not — lives here as a pure function rather than inline in the server
// action, where it could only ever be exercised through a live admin session.

export interface DomainDeletionCheck {
  /** The domain's name, used in the refusal sentence. */
  name: string;
  /** Mailboxes on the domain that are NOT the catch-all. */
  realMailboxCount: number;
}

export type DomainDeletionVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * Decide whether a domain may be deleted.
 *
 * A domain with real mailboxes is refused: those belong to customers, and the
 * cascade would take their mail with it. The refusal names the domain and the
 * count so the operator knows what to clear first — the previous behaviour was
 * a bare `return`, which looked exactly like success.
 */
export function checkDomainDeletion(input: DomainDeletionCheck): DomainDeletionVerdict {
  if (input.realMailboxCount > 0) {
    const plural = input.realMailboxCount === 1 ? 'mailbox' : 'mailboxes';
    return {
      allowed: false,
      reason: `${input.name} still has ${input.realMailboxCount} ${plural}. Delete or move them first.`,
    };
  }
  return { allowed: true };
}
