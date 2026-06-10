import { createHash, randomBytes, randomInt } from 'node:crypto';
import { renderTemplate, type TemplateContext } from '@inboxi/shared';

// Dynamic, generated-at-send-time variables. Unlike the recipient merge vars
// (which come from a CSV/context), these produce a fresh random value on every
// occurrence — so each recipient/message gets unique values:
//   {{random}}     8 random digits        {{random:6}}   6 random digits
//   {{md5}}        a random 32-hex md5     {{md5:12}}     first 12 hex chars
//   {{randmail}}   10-char random local    {{randmail:6}} 6-char random local
const DYNAMIC_RE = /\{\{\s*(random|md5|randmail)(?::(\d+))?\s*\}\}/gi;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function randomDigits(n: number): string {
  // First digit 1-9 so the result always has exactly n digits.
  let out = String(randomInt(1, 10));
  for (let i = 1; i < n; i++) out += String(randomInt(0, 10));
  return out;
}

const ALPHANUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
function randomAlphanum(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHANUM[randomInt(0, ALPHANUM.length)];
  return out;
}

export function resolveDynamicTokens(input: string): string {
  return input.replace(DYNAMIC_RE, (match, kindRaw: string, nStr?: string) => {
    const kind = kindRaw.toLowerCase();
    const n = nStr ? parseInt(nStr, 10) : undefined;
    if (kind === 'random') return randomDigits(clamp(n ?? 8, 1, 40));
    if (kind === 'md5') {
      const full = createHash('md5').update(randomBytes(16)).digest('hex');
      return n ? full.slice(0, clamp(n, 1, 32)) : full;
    }
    if (kind === 'randmail') return randomAlphanum(clamp(n ?? 10, 3, 40));
    return match;
  });
}

// Render a field: first expand dynamic generators (random/md5/randmail), then
// substitute the recipient's merge variables + fallbacks via the shared engine.
export function renderMessage(input: string, ctx: TemplateContext): string {
  return renderTemplate(resolveDynamicTokens(input), ctx);
}
