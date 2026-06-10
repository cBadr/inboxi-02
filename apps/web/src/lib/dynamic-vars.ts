import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { renderTemplate, type TemplateContext } from '@inboxi/shared';

// Dynamic, generated-at-send-time variables. Unlike recipient merge vars (from a
// CSV/context), these produce a fresh value on every occurrence — so each
// recipient/message gets unique values:
//   {{random}} / {{random:N}}        N random digits (default 8)
//   {{md5}} / {{md5:N}}              random MD5 hex (default 32, N truncates)
//   {{uuid}}                         random UUID v4
//   {{random_string}} / {{…:N}}      N random alphanumerics (default 12)
//   {{random_hex}} / {{…:N}}         N random hex chars (default 16)
//   {{random_name}}                  a random human first name
//   {{datetime}} / {{time}} / {{year}}   current date+time / time / year
//   {{randmail}} / {{randmail:N}}    random local part (used by Random sender)
const DYNAMIC_RE =
  /\{\{\s*(random_string|random_hex|random_name|randmail|random|md5|uuid|datetime|time|year)(?::(\d+))?\s*\}\}/gi;

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

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Sarah', 'Michael', 'Emma', 'David', 'Olivia', 'Daniel', 'Sophia',
  'Adam', 'Layla', 'Omar', 'Nour', 'Karim', 'Hana', 'Youssef', 'Mariam', 'Ali', 'Lina',
  'Lucas', 'Mia', 'Ethan', 'Ava', 'Noah', 'Isabella', 'Liam', 'Amelia', 'Henry', 'Zoe',
];

export function resolveDynamicTokens(input: string): string {
  return input.replace(DYNAMIC_RE, (match, kindRaw: string, nStr?: string) => {
    const kind = kindRaw.toLowerCase();
    const n = nStr ? parseInt(nStr, 10) : undefined;
    switch (kind) {
      case 'random':
        return randomDigits(clamp(n ?? 8, 1, 40));
      case 'md5': {
        const full = createHash('md5').update(randomBytes(16)).digest('hex');
        return n ? full.slice(0, clamp(n, 1, 32)) : full;
      }
      case 'uuid':
        return randomUUID();
      case 'random_string':
        return randomAlphanum(clamp(n ?? 12, 1, 64));
      case 'random_hex':
        return randomBytes(32).toString('hex').slice(0, clamp(n ?? 16, 1, 64));
      case 'random_name':
        return FIRST_NAMES[randomInt(0, FIRST_NAMES.length)]!;
      case 'datetime':
        return new Date().toLocaleString();
      case 'time':
        return new Date().toLocaleTimeString();
      case 'year':
        return String(new Date().getFullYear());
      case 'randmail':
        return randomAlphanum(clamp(n ?? 10, 3, 40));
      default:
        return match;
    }
  });
}

// Render a field: first expand dynamic generators (random/md5/randmail), then
// substitute the recipient's merge variables + fallbacks via the shared engine.
export function renderMessage(input: string, ctx: TemplateContext): string {
  return renderTemplate(resolveDynamicTokens(input), ctx);
}
