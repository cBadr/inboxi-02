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
  tier?: 'free' | 'pro'; // shown as a badge to highlight what's free
  category?: string; // groups features into columns
}
export interface Social {
  platform: string; // twitter | telegram | github | instagram | facebook | linkedin | youtube | discord | tiktok
  url: string;
}
export interface Partner {
  name: string;
  logo: string; // image URL
  desc: string;
  url: string;
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
  partnersHeading: string;
  partners: Partner[];
  features: { heading: string; subheading: string; items: Feature[] };
  steps: { heading: string; subheading: string; items: Step[] };
  stats: Stat[];
  freePerks: { heading: string; subheading: string; items: string[]; cta: CtaLink };
  pricingCta: { heading: string; subheading: string; cta: CtaLink; note: string };
  faq: { heading: string; items: Faq[] };
  finalCta: { heading: string; subheading: string; primaryCta: CtaLink; secondaryCta: CtaLink };
  footerTagline: string;
  socials: Social[];
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
  partnersHeading: 'Trusted by teams & builders',
  partners: [
    { name: 'Northwind', logo: 'https://placehold.co/120x40/eef2ff/4f46e5?text=Northwind', desc: 'Scaled signups with disposable QA inboxes.', url: '#' },
    { name: 'Acme Labs', logo: 'https://placehold.co/120x40/ecfeff/0891b2?text=Acme+Labs', desc: 'Automated email testing via the API.', url: '#' },
    { name: 'Pixelware', logo: 'https://placehold.co/120x40/f5f3ff/7c3aed?text=Pixelware', desc: 'OTP flows verified at scale.', url: '#' },
    { name: 'Bytecraft', logo: 'https://placehold.co/120x40/eef2ff/4f46e5?text=Bytecraft', desc: 'Custom domains for client mail.', url: '#' },
    { name: 'Lumen', logo: 'https://placehold.co/120x40/ecfeff/0891b2?text=Lumen', desc: 'Privacy-first onboarding.', url: '#' },
  ],
  features: {
    heading: 'A complete mail platform — not just throwaway addresses',
    subheading: 'Everything below is built in. Start free, upgrade only when you outgrow it.',
    items: [
      // Privacy & speed
      { category: 'Privacy & speed', icon: '⚡', title: 'Instant & anonymous', desc: 'A working inbox the moment you arrive — no forms, no waiting, no tracking.', tier: 'free' },
      { category: 'Privacy & speed', icon: '♾️', title: 'Unlimited receiving', desc: 'Receive as many emails as you want — no caps on incoming mail.', tier: 'free' },
      { category: 'Privacy & speed', icon: '🔑', title: 'OTP / code auto-extract', desc: 'Verification codes are detected and highlighted instantly — copy in one tap.', tier: 'free' },
      { category: 'Privacy & speed', icon: '🔒', title: 'Privacy guaranteed', desc: 'Addresses self-destruct on a timer and your real inbox never sees the spam.', tier: 'free' },
      { category: 'Privacy & speed', icon: '🔎', title: 'Inbox search', desc: 'Full-text search across senders, subjects, and message bodies.', tier: 'free' },
      { category: 'Privacy & speed', icon: '📎', title: 'Attachments', desc: 'Receive, preview, download, and send attachments with ease.', tier: 'free' },
      // Domains & sending
      { category: 'Domains & sending', icon: '🌐', title: 'Multiple custom domains', desc: 'Connect unlimited domains and use any address on each of them.', tier: 'pro' },
      { category: 'Domains & sending', icon: '🎲', title: 'Random send & receive', desc: 'Send and receive from random addresses on your custom domains automatically.', tier: 'pro' },
      { category: 'Domains & sending', icon: '🛡️', title: 'High Trust Score', desc: 'Self-healing SPF/DKIM/DMARC + reputation monitoring keep you out of spam.', tier: 'pro' },
      { category: 'Domains & sending', icon: '📤', title: 'Send via SMTP', desc: 'Authenticated outbound sending from your own addresses, DKIM-signed.', tier: 'pro' },
      { category: 'Domains & sending', icon: '↩️', title: 'Reply & compose', desc: 'Full reply, forward, variables, and scheduled sending built in.', tier: 'pro' },
      { category: 'Domains & sending', icon: '📱', title: 'SMTP → SMS', desc: 'Turn incoming email into SMS alerts so you never miss a code.', tier: 'pro' },
      // Power & integrations
      { category: 'Power & integrations', icon: '📥', title: 'Read via IMAP', desc: 'Connect any mail client — your messages, your apps, your way.', tier: 'pro' },
      { category: 'Power & integrations', icon: '🧩', title: 'Developer API & webhooks', desc: 'Automate inboxes and messages with API keys and real-time webhooks.', tier: 'pro' },
      { category: 'Power & integrations', icon: '🤖', title: 'Telegram notifications', desc: 'Get instant alerts in Telegram the moment mail arrives.', tier: 'pro' },
      { category: 'Power & integrations', icon: '🗂️', title: 'Permanent mailboxes', desc: 'Keep your inbox and history forever — no more vanishing messages.', tier: 'pro' },
      { category: 'Power & integrations', icon: '🔔', title: 'Sound alerts', desc: 'Hear a chime the instant a new message lands in your inbox.', tier: 'free' },
      { category: 'Power & integrations', icon: '🌍', title: 'Web, IMAP & API access', desc: 'Reach your mail however you like — webmail, mail clients, or code.', tier: 'pro' },
    ],
  },
  freePerks: {
    heading: 'Free is the whole point',
    subheading: "You don't need us — your inbox needs protecting. Start with everything below, free, forever.",
    items: [
      'A working inbox in seconds — no signup',
      'Unlimited incoming email',
      'Automatic OTP & verification-code detection',
      'Auto-expiring, zero-tracking privacy',
      'Inbox search & attachment downloads',
      'Upgrade only if you want more — never required',
    ],
    cta: { label: 'Claim your free inbox', href: '#inbox' },
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
  socials: [
    { platform: 'twitter', url: '' },
    { platform: 'telegram', url: '' },
    { platform: 'github', url: '' },
    { platform: 'instagram', url: '' },
    { platform: 'facebook', url: '' },
    { platform: 'youtube', url: '' },
  ],
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
