import { prisma } from '@inboxi/db';
import { SETTING_KEYS } from '@inboxi/shared';
import { getSetting } from './settings';

// Mail-client connection settings + account limits surfaced in the admin
// Mailboxes UI. SMTP reflects how the platform actually relays outbound mail;
// IMAP/POP3 are the standard retrieval endpoints (overridable via env), shown
// for clients that want to connect directly alongside the built-in webmail.

export interface ProtocolSetting {
  protocol: 'SMTP' | 'IMAP' | 'POP3';
  purpose: string;
  host: string;
  ports: Array<{ port: number; security: string; recommended?: boolean }>;
  username: string;
  authNote: string;
}

export interface MailLimits {
  maxMessageSizeMb: number;
  dailySendQuota: number; // free-tier baseline
  dailyReceiveQuota: number;
  retentionDays: number;
  dkimSigned: boolean;
  dmarcPolicy: string;
}

export interface ConnectionInfo {
  mailHost: string;
  webmail: string;
  protocols: ProtocolSetting[];
  limits: MailLimits;
}

function envInt(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// Build connection info for a domain (and optionally a concrete address). The
// `username` is the full email address the client authenticates as.
export async function getConnectionInfo(
  domainName: string,
  address?: string,
): Promise<ConnectionInfo> {
  const mailHost = process.env.MAIL_HOST ?? `mail.${domainName}`;
  // Allow a dedicated retrieval host (e.g. imap.inboxi.online); default to MAIL_HOST.
  const imapHost = process.env.IMAP_HOST ?? mailHost;
  const pop3Host = process.env.POP3_HOST ?? mailHost;
  const username = address ?? `you@${domainName}`;

  const [domain, maxSizeSetting, freePlan] = await Promise.all([
    prisma.domain.findUnique({ where: { name: domainName } }),
    getSetting(SETTING_KEYS.MAIL_MAX_MESSAGE_SIZE_MB).catch(() => undefined),
    prisma.plan.findUnique({ where: { slug: 'free' } }).catch(() => null),
  ]);

  const maxSize = maxSizeSetting ?? envInt('MAIL_MAX_MESSAGE_SIZE_MB', 25);

  const protocols: ProtocolSetting[] = [
    {
      protocol: 'SMTP',
      purpose: 'Outgoing mail (send)',
      host: mailHost,
      ports: [
        { port: envInt('SMTP_SUBMISSION_PORT', 587), security: 'STARTTLS', recommended: true },
        { port: 465, security: 'SSL/TLS' },
      ],
      username,
      authNote: 'Authenticate with your full address and mailbox password.',
    },
    {
      protocol: 'IMAP',
      purpose: 'Incoming mail (sync across devices)',
      host: imapHost,
      ports: [
        { port: envInt('IMAP_PORT', 993), security: 'SSL/TLS', recommended: true },
        { port: 143, security: 'STARTTLS' },
      ],
      username,
      authNote: 'Keeps server-side folders in sync. Webmail access is always available.',
    },
    {
      protocol: 'POP3',
      purpose: 'Incoming mail (download)',
      host: pop3Host,
      ports: [
        { port: envInt('POP3_PORT', 995), security: 'SSL/TLS', recommended: true },
        { port: 110, security: 'STARTTLS' },
      ],
      username,
      authNote: 'Downloads messages to a single device.',
    },
  ];

  return {
    mailHost,
    webmail: process.env.APP_URL ?? `https://${domainName}`,
    protocols,
    limits: {
      maxMessageSizeMb: maxSize,
      dailySendQuota: freePlan?.dailySendQuota ?? 0,
      dailyReceiveQuota: freePlan?.dailyReceiveQuota ?? 100,
      retentionDays: freePlan?.retentionDays ?? 1,
      dkimSigned: Boolean(domain?.dkimPublicKey && domain?.dkimPrivateKey),
      dmarcPolicy: domain?.dmarcPolicy ?? 'quarantine',
    },
  };
}
