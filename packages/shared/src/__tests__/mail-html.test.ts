import { describe, it, expect } from 'vitest';
import { buildMessageSrcDoc, linkifyPlainText, MESSAGE_IFRAME_SANDBOX } from '../mail-html';

describe('MESSAGE_IFRAME_SANDBOX', () => {
  it('allows popups but never scripts or same-origin', () => {
    expect(MESSAGE_IFRAME_SANDBOX).not.toContain('allow-scripts');
    expect(MESSAGE_IFRAME_SANDBOX).not.toContain('allow-same-origin');
    expect(MESSAGE_IFRAME_SANDBOX).toContain('allow-popups');
  });
});

describe('buildMessageSrcDoc', () => {
  it("strips the sender's own <base> so it can't hijack our forced target", () => {
    const out = buildMessageSrcDoc('<base href="https://evil.example/"><p>hi</p>');
    expect(out).not.toContain('evil.example');
    expect(out).toContain('<base target="_blank">');
  });

  it("drops an anchor's own target so <base> cannot be overridden", () => {
    const out = buildMessageSrcDoc('<a href="https://evil.example" target="_self">click</a>');
    expect(out).not.toMatch(/target\s*=\s*["']?_self/i);
    expect(out).toContain('<base target="_blank">');
    expect(out).toContain('href="https://evil.example"');
  });

  it('drops a sender <meta name="referrer"> that would undo no-referrer', () => {
    const out = buildMessageSrcDoc('<meta name="referrer" content="unsafe-url"><p>hi</p>');
    expect(out).not.toContain('unsafe-url');
    expect(out).toContain('<meta name="referrer" content="no-referrer">');
  });

  it('removes a <base> that only reassembles after the first pass', () => {
    const out = buildMessageSrcDoc('<ba<base href="https://evil.example/">se href="https://evil.example/">');
    expect(out).not.toMatch(/<base\b(?![^>]*target="_blank")/i);
    expect(out).not.toContain('evil.example');
  });

  it('is not fooled by a <head> that only exists inside a comment', () => {
    const out = buildMessageSrcDoc('<!-- <head> --><p>hi</p>');
    // The injected head must be real markup, not text inside a comment.
    expect(out).toContain('<head><meta charset="utf-8">');
    expect(out).toContain('<base target="_blank">');
  });

  it('strips <script> tags in depth even though the sandbox already blocks them', () => {
    const out = buildMessageSrcDoc('<p>hi</p><script>alert(document.cookie)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(document.cookie)');
  });

  it('injects into an existing document instead of nesting a document inside one', () => {
    const out = buildMessageSrcDoc('<html><head><title>t</title></head><body>hi</body></html>');
    expect(out.match(/<html/gi)?.length).toBe(1);
    expect(out).toContain('<base target="_blank">');
    expect(out).toContain('<title>t</title>');
  });

  it('creates a <head> after <html> when the body has no head of its own', () => {
    const out = buildMessageSrcDoc('<html><body>hi</body></html>');
    expect(out.match(/<html/gi)?.length).toBe(1);
    expect(out).toContain('<head><meta charset="utf-8">');
  });

  it('handles an empty body without throwing', () => {
    expect(() => buildMessageSrcDoc('')).not.toThrow();
    const out = buildMessageSrcDoc('');
    expect(out).toContain('<html>');
    expect(out).toContain('<body></body>');
  });

  it('never throws on malformed input, such as an unclosed <script>', () => {
    expect(() => buildMessageSrcDoc('<script>var x = "<img onerror=alert(1)>";')).not.toThrow();
    const out = buildMessageSrcDoc('<script>var x = "<img onerror=alert(1)>";');
    expect(typeof out).toBe('string');
    expect(out).toContain('<!doctype html>');
  });
});

describe('linkifyPlainText', () => {
  it('escapes HTML before linkifying, so a script tag cannot execute', () => {
    const out = linkifyPlainText('<script>alert(1)</script> visit https://x.com');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('<a href="https://x.com" target="_blank" rel="noopener noreferrer nofollow">');
  });

  it('does not swallow the period ending a sentence', () => {
    // The period must sit next to the URL for this to test anything at all.
    const out = linkifyPlainText('See https://example.com/a.');
    expect(out).toContain('href="https://example.com/a"');
    expect(out).toContain('</a>.');
  });

  it('balances a closing parenthesis that is not part of the URL', () => {
    const out = linkifyPlainText('See (https://example.com/a) now');
    expect(out).toContain('href="https://example.com/a"');
    expect(out).toContain('</a>) now');
  });

  it('linkifies a bare www. host and an email address', () => {
    const out = linkifyPlainText('Visit www.example.com or mail me@example.com');
    expect(out).toContain('href="https://www.example.com"');
    expect(out).toContain('href="mailto:me@example.com"');
  });

  it('keeps newlines as-is for a pre-wrap container', () => {
    const out = linkifyPlainText('line one\nline two');
    expect(out).toBe('line one\nline two');
  });
});
