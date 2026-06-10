import { prisma, AnonGateStatus, MessageDirection } from '@inboxi/db';
import type { InboundMail } from '@inboxi/shared';
import { getSetting } from './settings';
import { notifyNewMessage } from './notify';

export interface IngestResult {
  stored: boolean;
  messageId?: string;
  target: 'mailbox' | 'anonymous' | 'catch-all' | 'rejected';
  reason?: string;
}

function makeSnippet(mail: InboundMail): string {
  const base = mail.text ?? mail.html?.replace(/<[^>]+>/g, ' ') ?? '';
  return base.replace(/\s+/g, ' ').trim().slice(0, 200);
}

// Resolve an inbound recipient and persist the message. Resolution order:
//   1. an explicitly provisioned active mailbox at that exact address
//   2. an active anonymous session holding that temp address (apply the gate)
//   3. the domain's catch-all mailbox
// Unknown / inactive domains are rejected.
export async function ingestInbound(mail: InboundMail): Promise<IngestResult> {
  const toAddress = mail.to.trim().toLowerCase();
  const domainPart = toAddress.split('@')[1];
  if (!domainPart) {
    return { stored: false, target: 'rejected', reason: 'invalid_recipient' };
  }

  const domain = await prisma.domain.findUnique({ where: { name: domainPart } });
  if (!domain || !domain.isActive) {
    return { stored: false, target: 'rejected', reason: 'unknown_domain' };
  }

  const snippet = makeSnippet(mail);
  const baseData = {
    direction: MessageDirection.INBOUND,
    domainId: domain.id,
    fromAddress: mail.from,
    toAddress,
    subject: mail.subject ?? null,
    snippet,
    textBody: mail.text ?? null,
    htmlBody: mail.html ?? null,
    rawRef: mail.rawRef ?? null,
    sizeBytes: mail.rawSizeBytes,
  };

  const attachmentsCreate =
    mail.attachments.length > 0
      ? {
          attachments: {
            create: mail.attachments.map((a) => ({
              filename: a.filename,
              contentType: a.contentType ?? null,
              sizeBytes: a.sizeBytes,
              storageKey: a.contentBase64 ? '' : (mail.rawRef ?? ''),
              isInline: a.isInline,
            })),
          },
        }
      : {};

  // 1. Active provisioned mailbox
  const mailbox = await prisma.mailbox.findUnique({ where: { address: toAddress } });
  if (mailbox && mailbox.isActive && mailbox.isProvisioned) {
    const msg = await prisma.message.create({
      data: { ...baseData, mailboxId: mailbox.id, ...attachmentsCreate },
    });
    // Fire webhooks + forwarding (never blocks ingestion on failure).
    await notifyNewMessage(
      {
        id: msg.id,
        fromAddress: msg.fromAddress,
        toAddress: msg.toAddress,
        subject: msg.subject,
        snippet: msg.snippet,
        textBody: msg.textBody,
        htmlBody: msg.htmlBody,
      },
      {
        id: mailbox.id,
        userId: mailbox.userId,
        address: mailbox.address,
        domainId: mailbox.domainId,
        forwardTo: mailbox.forwardTo,
      },
    );
    return { stored: true, messageId: msg.id, target: 'mailbox' };
  }

  // 2. Anonymous session holding this temp address
  const session = await prisma.anonymousSession.findFirst({
    where: { tempAddress: toAddress, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (session) {
    const gateAfter = await getSetting('tempmail.gateAfterMessages');
    const newCount = session.messageCount + 1;
    const isGated = newCount > gateAfter;
    const msg = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { ...baseData, anonymousSessionId: session.id, isGated, ...attachmentsCreate },
      });
      await tx.anonymousSession.update({
        where: { id: session.id },
        data: {
          messageCount: newCount,
          gateStatus:
            session.gateStatus === AnonGateStatus.CONVERTED
              ? AnonGateStatus.CONVERTED
              : isGated
                ? AnonGateStatus.GATED
                : AnonGateStatus.OPEN,
        },
      });
      return created;
    });
    return { stored: true, messageId: msg.id, target: 'anonymous' };
  }

  // 3. Catch-all
  if (domain.catchAllMailboxId) {
    const msg = await prisma.message.create({
      data: { ...baseData, mailboxId: domain.catchAllMailboxId, ...attachmentsCreate },
    });
    return { stored: true, messageId: msg.id, target: 'catch-all' };
  }

  // No catch-all configured — still store against the domain so nothing is lost.
  const msg = await prisma.message.create({ data: { ...baseData, ...attachmentsCreate } });
  return { stored: true, messageId: msg.id, target: 'catch-all', reason: 'no_catch_all_mailbox' };
}
