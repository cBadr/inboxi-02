// Lightweight outbound content screening. A real deployment pairs this with
// rspamd; this gives a fast first-line score so obviously abusive mail never
// reaches the transport. Pure + unit-testable.

export interface AbuseVerdict {
  score: number; // 0 (clean) .. 100 (abusive)
  allowed: boolean;
  reasons: string[];
}

const BANNED_PHRASES = [
  'viagra',
  'crypto giveaway',
  'double your bitcoin',
  'nigerian prince',
  'wire transfer urgently',
  'verify your account password',
  'you have won',
];

const URL_RE = /https?:\/\/[^\s"']+/gi;

export function screenOutbound(input: {
  subject?: string;
  text?: string;
  html?: string;
}): AbuseVerdict {
  const reasons: string[] = [];
  let score = 0;

  const body = `${input.subject ?? ''}\n${input.text ?? ''}\n${input.html ?? ''}`;
  const lower = body.toLowerCase();

  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      score += 45;
      reasons.push(`banned phrase: ${phrase}`);
    }
  }

  const urls = body.match(URL_RE) ?? [];
  if (urls.length > 10) {
    score += 30;
    reasons.push(`too many links (${urls.length})`);
  } else if (urls.length > 5) {
    score += 10;
    reasons.push(`many links (${urls.length})`);
  }

  // All-caps shouting in subject.
  if (input.subject && input.subject.length > 10) {
    const letters = input.subject.replace(/[^a-z]/gi, '');
    const caps = input.subject.replace(/[^A-Z]/g, '');
    if (letters.length > 0 && caps.length / letters.length > 0.7) {
      score += 15;
      reasons.push('shouting subject');
    }
  }

  score = Math.min(100, score);
  return { score, allowed: score < 50, reasons };
}
