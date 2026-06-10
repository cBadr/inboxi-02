// Temporary address generator. The pattern is configured by the admin
// (settings key `tempmail.addressPattern`) so the local-part style can be
// changed without code changes.

import { randomInt } from 'node:crypto';

export type AddressPatternType = 'alphanumeric' | 'numeric' | 'letters' | 'words';

export interface AddressPattern {
  type: AddressPatternType;
  length?: number; // for char-based patterns
  wordCount?: number; // for the "words" pattern
  separator?: string; // for the "words" pattern
}

const ALPHANUM = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

// A small, pronounceable-ish word list for the "words" pattern.
const WORDS = [
  'sky', 'leaf', 'rapid', 'echo', 'pixel', 'nova', 'ember', 'frost', 'lunar', 'delta',
  'quartz', 'cobalt', 'maple', 'orbit', 'flux', 'jade', 'onyx', 'comet', 'spark', 'vivid',
];

function randomFrom(chars: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[randomInt(0, chars.length)];
  }
  return out;
}

function randomWord(): string {
  return WORDS[randomInt(0, WORDS.length)]!;
}

/** Generate the local part of a temporary address from a pattern. */
export function generateLocalPart(pattern: AddressPattern): string {
  switch (pattern.type) {
    case 'numeric':
      return randomFrom(DIGITS, pattern.length ?? 10);
    case 'letters':
      return randomFrom(LETTERS, pattern.length ?? 10);
    case 'words': {
      const count = pattern.wordCount ?? 2;
      const sep = pattern.separator ?? '.';
      const parts = Array.from({ length: count }, () => randomWord());
      // Append a few digits to keep collisions rare.
      return `${parts.join(sep)}${randomFrom(DIGITS, 3)}`;
    }
    case 'alphanumeric':
    default:
      return randomFrom(ALPHANUM, pattern.length ?? 10);
  }
}

/** Generate a full temporary email address for a given domain. */
export function generateTempAddress(domain: string, pattern: AddressPattern): string {
  return `${generateLocalPart(pattern)}@${domain}`;
}
