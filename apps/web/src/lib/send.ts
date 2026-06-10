import { prisma, OutboundStatus, TransportType, type DeliveryTransport } from '@inboxi/db';
import {
  deliverWithFailover,
  screenOutbound,
  type TransportConfig,
} from '@inboxi/integrations/delivery';
import type { SendMessageInput } from '@inboxi/shared';
import type { CurrentUser } from './session';
import { decryptSecret } from './crypto';
import { getAvailableDomains } from './domains';

// SMTP passwords are stored encrypted; fall back to the raw value if it wasn't
// (e.g. a self-host transport with no auth).
function decryptMaybe(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return decryptSecret(value);
  } catch {
    return value;
  }
}

// Map a stored DeliveryTransport row to a runtime TransportConfig.
export function transportToConfig(t: DeliveryTransport): TransportConfig {
  return {
    name: t.name,
    kind: t.type === 'SELF_HOST' ? 'SELF_HOST' : 'SMTP_RELAY',
    smtp:
      t.smtpHost && t.smtpPort
        ? {
            host: t.smtpHost,
            port: t.smtpPort,
            secure: t.smtpSecure ?? undefined,
            user: t.smtpUsername ?? undefined,
            pass: decryptMaybe(t.smtpPassword),
          }
        : undefined,
  };
}

export interface SendResult {
  ok: boolean;
  status: OutboundStatus;
  outboundId?: string;
  error?: string;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Effective daily send quota: admins are unlimited; otherwise the max
// dailySendQuota across active subscriptions, falling back to the free plan.
async function sendQuotaFor(user: CurrentUser): Promise<number> {
  if (user.roleName === 'admin') return Number.POSITIVE_INFINITY;
  const subs = await prisma.subscription.findMany({
    where: { userId: user.id, status: 'ACTIVE' },
    include: { plan: true },
  });
  if (subs.length) return Math.max(...subs.map((s) => s.plan.dailySendQuota));
  const free = await prisma.plan.findUnique({ where: { slug: 'free' } });
  return free?.dailySendQuota ?? 0;
}

// Build the ordered transport chain for a domain. Falls back to a TEST_STREAM
// transport in non-production when no SMTP transport is configured, so the send
// path is exercisable end-to-end without a real relay.
export async function resolveTransports(domainId: string): Promise<TransportConfig[]> {
  const chain: TransportConfig[] = [];

  const domainCfg = await prisma.domainDeliveryConfig.findUnique({
    where: { domainId },
    include: { transport: true },
  });
  const transports = await prisma.deliveryTransport.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { priority: 'asc' }],
  });

  const ordered = domainCfg?.transport
    ? [domainCfg.transport, ...transports.filter((t) => t.id !== domainCfg.transportId)]
    : transports;

  for (const t of ordered) {
    chain.push(transportToConfig(t));
  }

  if (chain.length === 0 && process.env.NODE_ENV !== 'production') {
    chain.push({ name: 'dev-stream', kind: 'TEST_STREAM' });
  }
  return chain;
}

export async function sendMail(user: CurrentUser, input: SendMessageInput): Promise<SendResult> {
  // Send from any address on a domain the user controls (provisioned or not).
  const fromAddress = input.from.trim().toLowerCase();
  const domainName = fromAddress.split('@')[1];
  if (!domainName) return { ok: false, status: OutboundStatus.FAILED, error: 'invalid_from' };

  const domain = await prisma.domain.findUnique({ where: { name: domainName } });
  if (!domain || !domain.isActive) {
    return { ok: false, status: OutboundStatus.FAILED, error: 'unknown_from_domain' };
  }
  // Admins may send from any domain; others only from available ones.
  if (user.roleName !== 'admin') {
    const available = await getAvailableDomains(user.id);
    if (!available.some((d) => d.id === domain.id)) {
      return { ok: false, status: OutboundStatus.FAILED, error: 'from_domain_not_available' };
    }
  }
  // Link to a real mailbox if the from-address is provisioned (for the record).
  const mailbox = await prisma.mailbox.findUnique({ where: { address: fromAddress } });

  // Quota
  const quota = await sendQuotaFor(user);
  const counter = await prisma.usageCounter.findUnique({
    where: { userId_metric_windowKey: { userId: user.id, metric: 'send.daily', windowKey: todayKey() } },
  });
  if ((counter?.value ?? 0) >= quota) {
    return { ok: false, status: OutboundStatus.BLOCKED, error: 'send_quota_exceeded' };
  }

  // Anti-abuse
  const verdict = screenOutbound({ subject: input.subject, text: input.text, html: input.html });
  if (!verdict.allowed) {
    const blocked = await prisma.outboundMessage.create({
      data: {
        userId: user.id,
        mailboxId: mailbox?.id ?? null,
        fromAddress,
        toAddress: input.to,
        subject: input.subject ?? null,
        status: OutboundStatus.BLOCKED,
        spamScore: verdict.score,
        lastError: verdict.reasons.join('; '),
      },
    });
    return { ok: false, status: OutboundStatus.BLOCKED, outboundId: blocked.id, error: 'blocked_by_anti_abuse' };
  }

  // Transport chain + DKIM
  const chain = await resolveTransports(domain.id);
  if (chain.length === 0) {
    return { ok: false, status: OutboundStatus.FAILED, error: 'no_transport' };
  }
  const dkimKey = decryptMaybe(domain.dkimPrivateKey);
  const dkim =
    dkimKey && domain.dkimPublicKey
      ? {
          domainName: domain.name,
          keySelector: domain.dkimSelector,
          privateKey: dkimKey,
        }
      : undefined;

  const result = await deliverWithFailover(chain, {
    from: fromAddress,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    dkim,
  });

  const usedTransport = chain.find((c) => c.name === result.transport);
  const transportType =
    usedTransport?.kind === 'SELF_HOST'
      ? TransportType.SELF_HOST
      : usedTransport?.kind === 'SMTP_RELAY'
        ? TransportType.SMTP_RELAY
        : null;

  const outbound = await prisma.outboundMessage.create({
    data: {
      userId: user.id,
      mailboxId: mailbox?.id ?? null,
      fromAddress,
      toAddress: input.to,
      subject: input.subject ?? null,
      status: result.ok ? OutboundStatus.SENT : OutboundStatus.FAILED,
      transportType,
      providerMessageId: result.messageId ?? null,
      dkimSigned: Boolean(dkim),
      spamScore: verdict.score,
      lastError: result.ok ? null : result.error ?? null,
      sentAt: result.ok ? new Date() : null,
    },
  });

  if (result.ok) {
    await prisma.usageCounter.upsert({
      where: { userId_metric_windowKey: { userId: user.id, metric: 'send.daily', windowKey: todayKey() } },
      update: { value: { increment: 1 } },
      create: { userId: user.id, metric: 'send.daily', windowKey: todayKey(), value: 1 },
    });
  }

  return {
    ok: result.ok,
    status: outbound.status,
    outboundId: outbound.id,
    error: result.ok ? undefined : result.error,
  };
}
