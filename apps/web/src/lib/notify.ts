import { createHmac } from 'node:crypto';
import { prisma, OutboundStatus, TransportType } from '@inboxi/db';
import { deliverWithFailover } from '@inboxi/integrations/delivery';
import { sendTelegramMessage } from '@inboxi/integrations/telegram';
import { renderTemplate } from '@inboxi/shared';
import { resolveTransports } from './send';

interface NewMessage {
  id: string;
  fromAddress: string;
  toAddress: string;
  subject: string | null;
  snippet: string | null;
  textBody: string | null;
  htmlBody: string | null;
}

interface MailboxRef {
  id: string;
  userId: string | null;
  address: string;
  domainId: string;
  forwardTo: string | null;
}

// After a message lands in a provisioned, user-owned mailbox: deliver outbound
// webhooks and forward the message if forwarding is configured. Failures here
// must never break ingestion, so everything is wrapped defensively.
export async function notifyNewMessage(message: NewMessage, mailbox: MailboxRef): Promise<void> {
  if (!mailbox.userId) return;
  await Promise.allSettled([
    fireWebhooks(message, mailbox),
    forwardMessage(message, mailbox),
    sendTelegramNotification(message, mailbox),
  ]);
}

async function sendTelegramNotification(message: NewMessage, mailbox: MailboxRef): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !mailbox.userId) return;

  const integration = await prisma.integration.findUnique({
    where: { userId_kind: { userId: mailbox.userId, kind: 'TELEGRAM' } },
  });
  if (!integration || !integration.isActive) return;
  const chatId = (integration.config as { chatId?: string } | null)?.chatId;
  if (!chatId) return;

  const template = await prisma.notificationTemplate.findUnique({
    where: { key: 'mail.received' },
  });
  const body = renderTemplate(template?.body ?? '📩 New mail for {{mailbox.address}}', {
    mailbox: { address: mailbox.address },
    message: { from: message.fromAddress, subject: message.subject ?? '(no subject)' },
  });

  await sendTelegramMessage({ botToken }, chatId, body);
}

async function fireWebhooks(message: NewMessage, mailbox: MailboxRef): Promise<void> {
  const hooks = await prisma.webhook.findMany({
    where: { userId: mailbox.userId!, isActive: true },
  });
  const payload = JSON.stringify({
    event: 'mail.received',
    mailbox: mailbox.address,
    message: {
      id: message.id,
      from: message.fromAddress,
      to: message.toAddress,
      subject: message.subject,
      snippet: message.snippet,
    },
  });

  await Promise.allSettled(
    hooks
      .filter((h) => Array.isArray(h.events) && (h.events as string[]).includes('mail.received'))
      .map(async (h) => {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (h.secret) {
          headers['x-inboxi-signature'] = createHmac('sha256', h.secret).update(payload).digest('hex');
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          await fetch(h.url, { method: 'POST', headers, body: payload, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
      }),
  );
}

async function forwardMessage(message: NewMessage, mailbox: MailboxRef): Promise<void> {
  if (!mailbox.forwardTo) return;
  const chain = await resolveTransports(mailbox.domainId);
  if (chain.length === 0) return;

  const result = await deliverWithFailover(chain, {
    from: mailbox.address,
    to: mailbox.forwardTo,
    subject: message.subject ? `Fwd: ${message.subject}` : 'Fwd:',
    text: message.textBody ?? message.snippet ?? undefined,
    html: message.htmlBody ?? undefined,
  });

  const used = chain.find((c) => c.name === result.transport);
  await prisma.outboundMessage.create({
    data: {
      userId: mailbox.userId,
      mailboxId: mailbox.id,
      fromAddress: mailbox.address,
      toAddress: mailbox.forwardTo,
      subject: message.subject ? `Fwd: ${message.subject}` : 'Fwd:',
      status: result.ok ? OutboundStatus.SENT : OutboundStatus.FAILED,
      transportType:
        used?.kind === 'SELF_HOST'
          ? TransportType.SELF_HOST
          : used?.kind === 'SMTP_RELAY'
            ? TransportType.SMTP_RELAY
            : null,
      sentAt: result.ok ? new Date() : null,
      lastError: result.ok ? null : result.error ?? null,
    },
  });
}
