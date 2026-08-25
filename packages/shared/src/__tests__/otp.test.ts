import { describe, it, expect } from 'vitest';
import { extractOtp, extractCodes } from '../otp';

describe('extractOtp', () => {
  it('extracts a 6-digit code near a keyword', () => {
    const m = extractOtp({ text: 'Your verification code is 482913. It expires in 10 minutes.' });
    expect(m?.code).toBe('482913');
    expect(m?.confidence).toBe('high');
  });

  it('extracts a Google-style G-code', () => {
    const m = extractOtp({ subject: 'G-558211 is your Google code', text: 'Use code G-558211' });
    expect(m?.code).toBe('558211');
  });

  it('falls back to a lone 6-digit number with medium confidence', () => {
    const m = extractOtp({ text: 'Hello, here is 246810 for you.' });
    expect(m?.code).toBe('246810');
    expect(m?.confidence).toBe('medium');
  });

  it('returns null when no code present', () => {
    expect(extractOtp({ text: 'Just saying hi, no numbers here.' })).toBeNull();
  });
});

describe('extractCodes', () => {
  it('finds two distinct codes in one message', () => {
    const codes = extractCodes({
      text: 'Your verification code is 482913. Backup code: 731044.',
    });
    expect(codes.map((c) => c.code)).toEqual(['482913', '731044']);
  });

  it('collapses a code that repeats into a single entry', () => {
    const codes = extractCodes({
      text: 'Your verification code is 482913. Again, your code is 482913.',
    });
    expect(codes).toHaveLength(1);
    expect(codes[0]?.code).toBe('482913');
  });

  it('respects the limit', () => {
    const codes = extractCodes(
      {
        text: 'codes: 111111, 222222, 333333, 444444, 555555',
      },
      2,
    );
    expect(codes).toHaveLength(2);
  });

  // The medium tier is a guess that only holds in the absence of anything
  // better. Once a keyword-anchored code is found, every other six-digit run in
  // the message is an order number or an amount, and badging it as a code is
  // worse than staying quiet.
  it('drops a stray six-digit number once a keyword-anchored code exists', () => {
    const padding = 'x'.repeat(60);
    const codes = extractCodes({
      text: `Your verification code is 482913. ${padding} Order 246810 shipped.`,
    });
    expect(codes).toEqual([{ code: '482913', confidence: 'high' }]);
  });

  it('stays quiet when several six-digit numbers compete and none is anchored', () => {
    expect(extractCodes({ text: 'Totals: 482913 and 731044 and 246810.' })).toEqual([]);
  });

  it('does not mistake shouted words for codes', () => {
    expect(extractCodes({ subject: 'VERIFY YOUR EMAIL NOW' })).toEqual([]);
  });

  // Seen live: a DMARC aggregate report was offering the tail of its own
  // Report-ID as a verification code.
  it('does not mistake part of a dotted identifier for a code', () => {
    expect(
      extractCodes({
        subject: 'Report Domain: inboxi.online Submitter: yahoo.com Report-ID: <1787636190.228156>',
      }),
    ).toEqual([]);
  });

  it('does not mistake a year for a code', () => {
    expect(extractCodes({ text: 'Your confirmation, copyright 2026.' })).toEqual([]);
  });

  it('falls back to the HTML body when the text body is an empty string', () => {
    const codes = extractCodes({
      text: '',
      html: '<p>Your verification code is <b>482913</b></p>',
    });
    expect(codes[0]?.code).toBe('482913');
  });

  it('returns an empty array when no codes are present', () => {
    expect(extractCodes({ text: 'Just saying hi, no numbers here.' })).toEqual([]);
  });
});
