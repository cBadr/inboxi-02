import { describe, it, expect } from 'vitest';
import { checkDomainDeletion } from '../domain-policy';

describe('checkDomainDeletion', () => {
  it('allows deleting a domain with no real mailboxes', () => {
    expect(checkDomainDeletion({ name: 'spare.test', realMailboxCount: 0 })).toEqual({
      allowed: true,
    });
  });

  it('refuses, and says why, when mailboxes would be cascaded away', () => {
    const verdict = checkDomainDeletion({ name: 'live.test', realMailboxCount: 4 });
    expect(verdict.allowed).toBe(false);
    // The refusal must name the domain and the count — a silent refusal is
    // indistinguishable from a successful delete, which is the bug this closes.
    expect(verdict.allowed === false && verdict.reason).toContain('live.test');
    expect(verdict.allowed === false && verdict.reason).toContain('4 mailboxes');
  });

  it('uses the singular for exactly one mailbox', () => {
    const verdict = checkDomainDeletion({ name: 'one.test', realMailboxCount: 1 });
    expect(verdict.allowed === false && verdict.reason).toContain('1 mailbox.');
  });
});
