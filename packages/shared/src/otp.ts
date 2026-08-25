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

export interface CodeMatch {
  code: string;
  confidence: 'high' | 'medium';
}

interface Candidate {
  code: string;
  index: number;
  isSixDigit: boolean;
}

function collectCandidates(haystack: string): Candidate[] {
  const candidates: Candidate[] = [];
  for (const m of haystack.matchAll(TOKEN_RE)) {
    const raw = m[1]!;
    const normalized = raw.replace(/^[A-Z]?-/, '');

    // A code has digits in it. Without this, an all-caps word in a subject
    // ("VERIFY YOUR EMAIL") matches the alphanumeric branch and gets presented
    // to the reader as a verification code.
    if (!/\d/.test(normalized)) continue;
    // Four digits starting 19xx/20xx is a year far more often than a code.
    if (/^(?:19|20)\d{2}$/.test(normalized)) continue;

    // A run of digits hanging off a dot or a slash is a fragment of a longer
    // identifier, not a code — a DMARC report titled
    // "Report-ID: <1787636190.228156>" was offering 228156 as one.
    const index = m.index ?? 0;
    const before = index > 0 ? haystack[index - 1] : '';
    const after = haystack[index + raw.length] ?? '';
    if (before === '.' || before === '/') continue;
    if ((after === '.' || after === '/') && /\d/.test(haystack[index + raw.length + 1] ?? '')) {
      continue;
    }

    if (/^\d{4,8}$/.test(normalized) || /^[A-Z0-9]{5,8}$/.test(raw)) {
      candidates.push({
        code: normalized,
        index,
        isSixDigit: /^\d{6}$/.test(normalized),
      });
    }
  }
  return candidates;
}

function isNearKeyword(haystack: string, candidate: Candidate): boolean {
  const windowStart = Math.max(0, candidate.index - 40);
  const around = haystack.slice(windowStart, candidate.index + candidate.code.length + 20);
  return KEYWORDS.test(around);
}

/** Every distinct code worth offering the reader, best first. */
export function extractCodes(
  input: { subject?: string; text?: string; html?: string },
  limit = 4,
): CodeMatch[] {
  // `||` not `??`: a mail whose only content is HTML can arrive with an empty
  // string for text, and `'' ?? html` keeps the empty string — no codes at all.
  const haystack = `${input.subject ?? ''}\n${input.text || stripHtml(input.html)}`;
  if (!haystack.trim()) return [];

  const candidates = collectCandidates(haystack);
  if (candidates.length === 0) return [];

  const highCodes = new Set<string>();
  const high: CodeMatch[] = [];
  for (const c of candidates) {
    if (highCodes.has(c.code)) continue;
    if (isNearKeyword(haystack, c)) {
      highCodes.add(c.code);
      high.push({ code: c.code, confidence: 'high' });
    }
  }

  // The medium tier is the "no keyword anywhere, but a lone six-digit number is
  // the classic code shape" guess. It only holds while the number is alone: a
  // message full of six-digit figures is an invoice, not a login code, and
  // dressing several of them up as codes is worse than offering none.
  const sixDigit = [...new Set(candidates.filter((c) => c.isSixDigit).map((c) => c.code))];
  const medium: CodeMatch[] =
    high.length === 0 && sixDigit.length === 1 && sixDigit[0]
      ? [{ code: sixDigit[0], confidence: 'medium' }]
      : [];

  return [...high, ...medium].slice(0, limit);
}

export function extractOtp(input: { subject?: string; text?: string; html?: string }): OtpMatch | null {
  return extractCodes(input, 1)[0] ?? null;
}

function stripHtml(html?: string): string {
  return html ? html.replace(/<[^>]+>/g, ' ') : '';
}
