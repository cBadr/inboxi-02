import { describe, it, expect } from 'vitest';
import { generateTempAddress } from '../temp-address';
import { renderTemplate, extractVariables } from '../template';

describe('temp-address', () => {
  it('generates an alphanumeric address of the given length', () => {
    const addr = generateTempAddress('inboxi.online', { type: 'alphanumeric', length: 12 });
    const [local, domain] = addr.split('@');
    expect(domain).toBe('inboxi.online');
    expect(local).toHaveLength(12);
    expect(local).toMatch(/^[a-z0-9]+$/);
  });

  it('generates a words address with a separator', () => {
    const addr = generateTempAddress('inboxi.online', {
      type: 'words',
      wordCount: 2,
      separator: '-',
    });
    expect(addr).toMatch(/^[a-z]+-[a-z]+\d{3}@inboxi\.online$/);
  });
});

describe('template engine', () => {
  it('interpolates dot-path variables', () => {
    const out = renderTemplate('From: {{message.from}} / {{message.subject}}', {
      message: { from: 'a@b.com', subject: 'Hi' },
    });
    expect(out).toBe('From: a@b.com / Hi');
  });

  it('uses fallback when value is missing', () => {
    const out = renderTemplate('{{message.subject | (no subject)}}', { message: {} });
    expect(out).toBe('(no subject)');
  });

  it('extracts referenced variables', () => {
    expect(extractVariables('{{a.b}} {{c | x}}').sort()).toEqual(['a.b', 'c']);
  });
});
