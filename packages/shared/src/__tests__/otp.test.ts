import { describe, it, expect } from 'vitest';
import { extractOtp } from '../otp';

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
