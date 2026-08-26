import { describe, it, expect } from 'vitest';
import { parseQueueId, sentAtForStatus, statusForHandoff } from '../delivery-status';

describe('statusForHandoff', () => {
  it('does not call a message sent when only our own spool accepted it', () => {
    expect(statusForHandoff('SELF_HOST', true)).toBe('QUEUED');
  });

  it('calls a message sent once a relay has taken responsibility', () => {
    expect(statusForHandoff('SMTP_RELAY', true)).toBe('SENT');
  });

  it('treats the dev dry-run as sent so local flows stay workable', () => {
    expect(statusForHandoff('TEST_STREAM', true)).toBe('SENT');
  });

  it('claims the weaker thing for an unknown transport', () => {
    expect(statusForHandoff(null, true)).toBe('QUEUED');
  });

  it('is FAILED whenever the hand-off itself failed, whatever the transport', () => {
    expect(statusForHandoff('SMTP_RELAY', false)).toBe('FAILED');
    expect(statusForHandoff('SELF_HOST', false)).toBe('FAILED');
    expect(statusForHandoff(null, false)).toBe('FAILED');
  });
});

describe('sentAtForStatus', () => {
  it('timestamps only a real send', () => {
    const now = new Date('2026-08-26T12:00:00.000Z');
    expect(sentAtForStatus('SENT', now)).toEqual(now);
    expect(sentAtForStatus('QUEUED', now)).toBeNull();
    expect(sentAtForStatus('FAILED', now)).toBeNull();
  });
});

describe('parseQueueId', () => {
  it('reads the id out of a Haraka accept', () => {
    expect(parseQueueId('250 Message Queued (D4F2A1B9C)')).toBe('D4F2A1B9C');
  });

  it('reads the postfix-style "queued as" form', () => {
    expect(parseQueueId('250 2.0.0 Ok: queued as 4X1pQ2')).toBe('4X1pQ2');
  });

  it('returns null when the reply carries no id', () => {
    expect(parseQueueId('250 OK')).toBeNull();
    expect(parseQueueId(undefined)).toBeNull();
    expect(parseQueueId('')).toBeNull();
  });
});
