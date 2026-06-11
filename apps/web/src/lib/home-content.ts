import { prisma } from '@inboxi/db';

// Structured, CMS-editable content for the marketing homepage. Stored as JSON in
// the Setting store under `cms.home` and edited from Admin → CMS → Homepage.
// Anything missing falls back to DEFAULT_HOME, so the page always renders.

export interface CtaLink {
  label: string;
  href: string;
}
export interface Feature {
  icon: string; // short emoji/char shown in the feature badge
  title: string;
  desc: string;
}
export interface Step {
  title: string;
  desc: string;
}
export interface Stat {
  value: string;
  label: string;
}
export interface Faq {
  q: string;
  a: string;
}

export interface HomeContent {
  hero: {
    badge: string;
    title: string;
    highlight: string;
    subtitle: string;
    primaryCta: CtaLink;
    secondaryCta: CtaLink;
    trustNote: string;
  };
  trustBar: string[];
  features: { heading: string; subheading: string; items: Feature[] };
  steps: { heading: string; subheading: string; items: Step[] };
  stats: Stat[];
  pricingCta: { heading: string; subheading: string; cta: CtaLink; note: string };
  faq: { heading: string; items: Faq[] };
  finalCta: { heading: string; subheading: string; primaryCta: CtaLink; secondaryCta: CtaLink };
  footerTagline: string;
}

export const DEFAULT_HOME: HomeContent = {
  hero: {
    badge: '✦ Free disposable email — no signup to start',
    title: 'Your temporary inbox,',
    highlight: 'ready in a heartbeat',
    subtitle:
      'Spin up a private, throwaway email address instantly. Receive verification codes, sign-ups, and files — keep your real inbox clean and spam-free.',
    primaryCta: { label: 'Get my free inbox', href: '#inbox' },
    secondaryCta: { label: 'See pricing', href: '/pricing' },
    trustNote: 'No credit card • No signup • Works in seconds',
  },
  trustBar: ['Instant addresses', 'Auto-expiring', 'OTP auto-detect', 'Custom domains', 'Developer API'],
  features: {
    heading: 'Everything you need from a temp mail — and more',
    subheading: 'Built for privacy, speed, and people who hate spam.',
    items: [
      { icon: '⚡', title: 'Instant & anonymous', desc: 'A working address the moment you arrive — no forms, no waiting, no tracking.' },
      { icon: '🔒', title: 'Privacy by default', desc: 'Addresses self-destruct on a timer. Your real inbox never sees the spam.' },
      { icon: '🔑', title: 'OTP auto-extract', desc: 'Verification codes are detected and highlighted instantly — copy in one tap.' },
      { icon: '🌐', title: 'Your own domains', desc: 'Bring a custom domain and send & receive from any address on it.' },
      { icon: '📨', title: 'Send, not just receive', desc: 'Reply and compose from your temporary or custom addresses.' },
      { icon: '🧩', title: 'Developer API', desc: 'Automate inboxes and messages with API keys and webhooks.' },
    ],
  },
  steps: {
    heading: 'Three steps. Zero friction.',
    subheading: 'From landing here to a working inbox in under five seconds.',
    items: [
      { title: 'Land & get an address', desc: 'A fresh, random address is generated for you automatically.' },
      { title: 'Use it anywhere', desc: 'Paste it into any sign-up or form and watch mail arrive live.' },
      { title: 'Sign up to keep it', desc: 'Create a free account to unlock history, more inboxes, and sending.' },
    ],
  },
  stats: [
    { value: '99.9%', label: 'Inbox delivery' },
    { value: '5s', label: 'To a live address' },
    { value: '0', label: 'Signup friction' },
    { value: '24/7', label: 'Mail monitoring' },
  ],
  pricingCta: {
    heading: 'Ready for more than throwaway?',
    subheading: 'Upgrade for permanent inboxes, custom domains, higher quotas, sending, and the developer API.',
    cta: { label: 'Explore plans', href: '/pricing' },
    note: 'Crypto payments supported • Cancel anytime',
  },
  faq: {
    heading: 'Frequently asked questions',
    items: [
      { q: 'Is it really free?', a: 'Yes. You get a working temporary inbox instantly with no signup. Paid plans add permanence, custom domains, sending, and higher limits.' },
      { q: 'How long does an address last?', a: 'Anonymous addresses auto-expire on a countdown. Create a free account to keep your messages and get longer-lived inboxes.' },
      { q: 'Can I receive verification codes?', a: 'Absolutely — codes are auto-detected and highlighted so you can copy them in one tap.' },
      { q: 'Can I use my own domain?', a: 'Yes. On paid plans you can connect a custom domain and send & receive from any address on it.' },
      { q: 'Do you offer an API?', a: 'Yes — generate API keys and subscribe to webhooks to automate inboxes and messages.' },
    ],
  },
  finalCta: {
    heading: 'Take back your inbox today',
    subheading: 'Start with a free disposable address — upgrade whenever you need more.',
    primaryCta: { label: 'Create free account', href: '/signup' },
    secondaryCta: { label: 'Try it now', href: '#inbox' },
  },
  footerTagline: 'Disposable email that respects your privacy.',
};

// Deep-merge stored content over the defaults so partial edits are safe.
function merge<T>(base: T, override: unknown): T {
  if (override == null || typeof override !== 'object' || Array.isArray(override)) {
    return (override as T) ?? base;
  }
  const out = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = Array.isArray(v) ? v : v && typeof v === 'object' ? merge(b, v) : v;
  }
  return out as T;
}

export async function getHomeContent(): Promise<HomeContent> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'cms.home' } });
    if (row?.value) return merge(DEFAULT_HOME, row.value);
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_HOME;
}

export async function saveHomeContentRaw(content: HomeContent): Promise<void> {
  await prisma.setting.upsert({
    where: { key: 'cms.home' },
    update: { value: content as object },
    create: { key: 'cms.home', value: content as object, category: 'cms' },
  });
}
