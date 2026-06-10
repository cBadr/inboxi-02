// Heuristic one-time-code / verification-code extraction. Temp-mail users
// overwhelmingly want the code, so surfacing it prominently is a killer feature.

const KEYWORDS =
  /(?:otp|code|verification|verify|passcode|pin|one[-\s]?time|confirm(?:ation)?|security code)/i;

// Candidate tokens: 4-8 char runs that are digits, or letter+digit mixes like
// "G-123456" / "AB12CD". Avoid matching years/phone-ish long numbers.
const TOKEN_RE = /\b([A-Z]?-?\d{4,8}|[A-Z0-9]{5,8})\b/g;

export interface OtpMatch {
  code: string;
  confidence: 'high' | 'medium';
}

export function extractOtp(input: { subject?: string; text?: string; html?: string }): OtpMatch | null {
  const haystack = `${input.subject ?? ''}\n${input.text ?? stripHtml(input.html)}`;
  if (!haystack.trim()) return null;

  const candidates: Array<{ code: string; index: number; pure: boolean }> = [];
  for (const m of haystack.matchAll(TOKEN_RE)) {
    const raw = m[1]!;
    const normalized = raw.replace(/^[A-Z]?-/, '');
    if (/^\d{4,8}$/.test(normalized) || /^[A-Z0-9]{5,8}$/.test(raw)) {
      candidates.push({ code: normalized, index: m.index ?? 0, pure: /^\d+$/.test(normalized) });
    }
  }
  if (candidates.length === 0) return null;

  // Prefer a candidate near an OTP keyword.
  for (const c of candidates) {
    const windowStart = Math.max(0, c.index - 40);
    const around = haystack.slice(windowStart, c.index + c.code.length + 20);
    if (KEYWORDS.test(around)) {
      return { code: c.code, confidence: 'high' };
    }
  }

  // Otherwise a lone 6-digit number is the classic OTP shape.
  const sixDigit = candidates.find((c) => /^\d{6}$/.test(c.code));
  if (sixDigit) return { code: sixDigit.code, confidence: 'medium' };

  return null;
}

function stripHtml(html?: string): string {
  return html ? html.replace(/<[^>]+>/g, ' ') : '';
}
