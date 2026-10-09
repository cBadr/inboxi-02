import { describe, it, expect } from 'vitest';
import {
  compactBody,
  escapeHtml,
  extractLinks,
  formatInboundMail,
  formatOperatorAlert,
  htmlToText,
  isWatchedDomain,
  parseWatchList,
  pickActionLink,
  shortenUrl,
} from '../telegram-format';

const base = {
  from: 'noreply@service.com',
  to: 'abc@inboxi.online',
  domain: 'inboxi.online',
  target: 'catch-all',
  attachments: [] as { filename: string; sizeBytes: number; isInline: boolean }[],
};

describe('watch list', () => {
  it('parses commas, semicolons and whitespace, lowercased', () => {
    expect(parseWatchList(' Inboxi.Online, b.com;\n*')).toEqual(['inboxi.online', 'b.com', '*']);
    expect(parseWatchList('')).toEqual([]);
  });

  it('matches exact domains and the * wildcard', () => {
    expect(isWatchedDomain('inboxi.online', ['inboxi.online'])).toBe(true);
    expect(isWatchedDomain('Inboxi.Online', ['inboxi.online'])).toBe(true);
    expect(isWatchedDomain('other.com', ['inboxi.online'])).toBe(false);
    expect(isWatchedDomain('other.com', ['*'])).toBe(true);
  });
});

describe('text helpers', () => {
  it('escapes HTML metacharacters', () => {
    expect(escapeHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('turns HTML into readable text', () => {
    const t = htmlToText('<style>p{}</style><p>Hello&nbsp;<b>World</b></p><br>Tom &amp; Jerry');
    expect(t).toContain('Hello World');
    expect(t).toContain('Tom & Jerry');
    expect(t).not.toContain('p{}');
  });

  it('collapses whitespace and shortens long URLs in previews', () => {
    const url = `https://example.com/very/long/path/${'x'.repeat(80)}?token=abc`;
    const out = compactBody(`Hi\r\n\r\n\r\n\r\n   there   \n${url}`);
    expect(out).not.toMatch(/\n{3,}/);
    expect(out).toContain('example.com/');
    expect(out).not.toContain('token=abc');
    expect(shortenUrl('https://a.com/')).toBe('a.com');
  });
});

describe('links', () => {
  it('collects html hrefs and text URLs without trailing punctuation', () => {
    const links = extractLinks({
      html: '<a href="https://a.com/verify?x=1&amp;y=2">go</a>',
      text: 'or open https://b.com/page.',
    });
    expect(links).toEqual(['https://a.com/verify?x=1&y=2', 'https://b.com/page']);
  });

  it('picks a verification link and ignores unsubscribe noise', () => {
    expect(
      pickActionLink(['https://x.com/unsubscribe?verify=1', 'https://x.com/confirm/abc']),
    ).toBe('https://x.com/confirm/abc');
    expect(pickActionLink(['https://x.com/blog'])).toBeUndefined();
  });
});

describe('formatInboundMail', () => {
  it('shows the verification code, a copy button and escaped fields', () => {
    const m = formatInboundMail({
      ...base,
      subject: 'Your <code> & more',
      text: 'Your verification code is 482913. It expires in 10 minutes.',
    });
    expect(m.text).toContain('<b>New mail</b>');
    expect(m.text).toContain('<code>inboxi.online</code>');
    expect(m.text).toContain('Your &lt;code&gt; &amp; more');
    expect(m.text).toContain('<code>482913</code>');
    expect(m.text).toContain('<blockquote expandable>');
    expect(m.buttons?.[0]?.[0]).toEqual({ text: '📋 Copy code 482913', copyText: '482913' });
  });

  it('adds a verify-link button and an admin button', () => {
    const m = formatInboundMail({
      ...base,
      subject: 'Confirm your email',
      html: '<p>Click <a href="https://app.example.com/confirm?t=abc">here</a></p>',
      adminUrl: 'https://inboxi.online/admin/inboxes/d1/m1',
    });
    const row = m.buttons?.at(-1) ?? [];
    expect(row.map((b) => b.url)).toEqual([
      'https://app.example.com/confirm?t=abc',
      'https://inboxi.online/admin/inboxes/d1/m1',
    ]);
  });

  it('lists attachments but not inline images', () => {
    const m = formatInboundMail({
      ...base,
      subject: 'Invoice',
      text: 'See attached.',
      attachments: [
        { filename: 'invoice.pdf', sizeBytes: 120 * 1024, isInline: false },
        { filename: 'logo.png', sizeBytes: 900, isInline: true },
      ],
    });
    expect(m.text).toContain('Attachments (1)');
    expect(m.text).toContain('invoice.pdf');
    expect(m.text).toContain('120 KB');
    expect(m.text).not.toContain('logo.png');
  });

  it('works for an html-only mail with no subject and no code', () => {
    const m = formatInboundMail({ ...base, html: '<p>Just saying hi</p>' });
    expect(m.text).toContain('(no subject)');
    expect(m.text).toContain('Just saying hi');
    expect(m.text).not.toContain('Verification code');
    expect(m.buttons).toBeUndefined();
  });

  it('stays under the Telegram limit for a huge, escape-heavy body', () => {
    const m = formatInboundMail({
      ...base,
      subject: 'big',
      text: '<&>'.repeat(5000),
      attachments: Array.from({ length: 12 }, (_, i) => ({
        filename: `file-${i}-${'n'.repeat(80)}.bin`,
        sizeBytes: 1024 * 1024 * 3,
        isInline: false,
      })),
    });
    expect(m.text.length).toBeLessThanOrEqual(4096);
    expect(m.text).toContain('…and 7 more');
    expect(m.text).toContain('…</blockquote>');
  });
});

describe('formatOperatorAlert', () => {
  it('renders title, rows, a note and link buttons', () => {
    const m = formatOperatorAlert({
      severity: 'critical',
      title: 'Sending health',
      subtitle: 'Outbound mail needs attention',
      rows: [{ label: '24h failure rate', value: '35% <bad>', strong: true }],
      note: 'Check delivery.',
      links: [{ text: 'Open Delivery', url: 'https://inboxi.online/admin/delivery' }],
    });
    expect(m.text.startsWith('🚨 <b>Sending health</b>')).toBe(true);
    expect(m.text).toContain('▪️ <b>24h failure rate:</b> <b>35% &lt;bad&gt;</b>');
    expect(m.text).toContain('<blockquote>Check delivery.</blockquote>');
    expect(m.buttons).toEqual([[{ text: 'Open Delivery', url: 'https://inboxi.online/admin/delivery' }]]);
  });

  it('omits the keyboard when there are no links', () => {
    expect(formatOperatorAlert({ severity: 'ok', title: 'Test' }).buttons).toBeUndefined();
  });
});
