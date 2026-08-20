import { describe, it, expect } from 'vitest';
import { gtmContainerIdSchema, gtmConfigSchema, gtmShouldLoad } from '../google';

describe('gtmContainerIdSchema', () => {
  it('accepts a well-formed id', () => {
    expect(gtmContainerIdSchema.parse('GTM-ABC1234')).toBe('GTM-ABC1234');
  });

  it('normalizes a pasted id — whitespace and lowercase', () => {
    expect(gtmContainerIdSchema.parse('  gtm-abc1234 ')).toBe('GTM-ABC1234');
  });

  it('rejects ids that would render a snippet loading nothing', () => {
    for (const bad of ['', 'ABC1234', 'GTM-', 'GTM-AB', 'G-ABC1234', 'GTM-ABC 1234', 'GTM-ABC_1234']) {
      expect(gtmContainerIdSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('accepts a UA-style measurement id only when GTM-prefixed', () => {
    // G-XXXX is a GA4 measurement id, not a GTM container — a common paste mistake.
    expect(gtmContainerIdSchema.safeParse('G-1A2B3C4D5E').success).toBe(false);
  });
});

describe('gtmConfigSchema', () => {
  it('defaults to not tracking signed-in app pages', () => {
    expect(gtmConfigSchema.parse({ containerId: 'GTM-ABC1234' }).includeAppPages).toBe(false);
  });
});

describe('gtmShouldLoad', () => {
  it('loads on public pages', () => {
    for (const p of ['/', '/pricing', '/p/about', '/login']) {
      expect(gtmShouldLoad(p, false)).toBe(true);
    }
  });

  it('skips the admin console and the customer dashboard by default', () => {
    for (const p of ['/admin', '/admin/domains', '/dashboard', '/dashboard/mailboxes/1']) {
      expect(gtmShouldLoad(p, false)).toBe(false);
    }
  });

  it('does not treat a public path that merely starts with the same letters as an app page', () => {
    expect(gtmShouldLoad('/administrators', false)).toBe(true);
    expect(gtmShouldLoad('/dashboards-explained', false)).toBe(true);
  });

  it('loads everywhere when the operator opts in', () => {
    expect(gtmShouldLoad('/admin/domains', true)).toBe(true);
  });
});
