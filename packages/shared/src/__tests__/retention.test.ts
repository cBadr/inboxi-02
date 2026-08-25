import { describe, it, expect } from 'vitest';
import { RETENTION_FOREVER, effectiveRetentionDays, retentionCutoff } from '../retention';

describe('effectiveRetentionDays', () => {
  it('falls back to the platform default when the subscriber has no plans', () => {
    expect(effectiveRetentionDays([], 30)).toBe(30);
  });

  it('lets forever (0) beat a longer plan, since it is a floor, not a small number', () => {
    expect(effectiveRetentionDays([0, 30], 30)).toBe(RETENTION_FOREVER);
  });

  it('picks the longest plan when the subscriber is on more than one', () => {
    expect(effectiveRetentionDays([7, 90, 30], 30)).toBe(90);
  });

  it('treats negative or non-finite plan values as forever, not as invalid', () => {
    expect(effectiveRetentionDays([-5, 30], 30)).toBe(RETENTION_FOREVER);
    expect(effectiveRetentionDays([Number.NaN, 30], 30)).toBe(RETENTION_FOREVER);
    expect(effectiveRetentionDays([Number.POSITIVE_INFINITY, 30], 30)).toBe(RETENTION_FOREVER);
  });
});

describe('retentionCutoff', () => {
  it('returns null for forever (0 days)', () => {
    expect(retentionCutoff(0)).toBeNull();
  });

  it('returns null for a negative or non-finite day count', () => {
    expect(retentionCutoff(-1)).toBeNull();
    expect(retentionCutoff(Number.NaN)).toBeNull();
  });

  it('subtracts the day count from `now` in milliseconds', () => {
    const now = new Date('2026-08-25T00:00:00.000Z');
    const cutoff = retentionCutoff(30, now);
    expect(cutoff?.toISOString()).toBe('2026-07-26T00:00:00.000Z');
  });
});
