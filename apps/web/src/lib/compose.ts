import { prisma } from '@inboxi/db';
import type { ComposeInput, ComposeRecipient } from '@inboxi/shared';
import type { CurrentUser } from './session';
import { sendMail } from './send';
import { renderMessage } from './dynamic-vars';

export interface ComposeResult {
  sent: number;
  failed: number;
  total: number;
  blocked: boolean; // true when stopped early (e.g. quota/anti-abuse)
  errors: Array<{ email: string; error: string }>;
}

// Build the template context for one recipient: their merge variables plus a
// few system values, exposed both flat ({{name}}) and namespaced ({{recipient.name}}).
function contextFor(from: string, recipient: ComposeRecipient): Record<string, unknown> {
  const vars = recipient.vars ?? {};
  return {
    ...vars,
    to: recipient.email,
    email: recipient.email,
    from,
    domain: from.split('@')[1] ?? '',
    date: new Date().toLocaleDateString(),
    recipient: { email: recipient.email, ...vars },
  };
}

// Deliver a composed message to every recipient now, substituting per-recipient
// variables in the subject + body. Stops early if a send is blocked by quota or
// anti-abuse (further sends would be blocked too).
export async function sendComposed(
  user: CurrentUser,
  input: Omit<ComposeInput, 'scheduleAt'>,
): Promise<ComposeResult> {
  const result: ComposeResult = {
    sent: 0,
    failed: 0,
    total: input.recipients.length,
    blocked: false,
    errors: [],
  };

  for (const recipient of input.recipients) {
    // Resolve a (possibly random) from-address first, then expose it in the
    // context so the body can reference {{from}} consistently.
    const from = renderMessage(input.from, contextFor(input.from, recipient));
    const ctx = contextFor(from, recipient);
    const subject = input.subject ? renderMessage(input.subject, ctx) : undefined;
    const text = input.text ? renderMessage(input.text, ctx) : undefined;
    const html = input.html ? renderMessage(input.html, ctx) : undefined;

    const r = await sendMail(user, {
      from,
      to: recipient.email,
      subject,
      text,
      html,
      attachments: input.attachments,
    });

    if (r.ok) {
      result.sent += 1;
    } else {
      result.failed += 1;
      result.errors.push({ email: recipient.email, error: r.error ?? 'send_failed' });
      // Quota/anti-abuse blocks are terminal for the whole batch.
      if (r.status === 'BLOCKED') {
        result.blocked = true;
        break;
      }
    }
  }

  return result;
}

// Persist a composed message for future delivery. Returns the scheduled row id.
export async function scheduleComposed(
  user: CurrentUser,
  input: ComposeInput,
  scheduleAt: Date,
): Promise<string> {
  const row = await prisma.scheduledMessage.create({
    data: {
      userId: user.id,
      fromAddress: input.from,
      subject: input.subject ?? null,
      bodyText: input.text ?? null,
      bodyHtml: input.html ?? null,
      recipients: input.recipients,
      attachments: input.attachments ?? undefined,
      scheduleAt,
      totalCount: input.recipients.length,
      status: 'PENDING',
    },
  });
  return row.id;
}

// Process one due scheduled message: rebuild the sending user, deliver to all
// recipients, and record the outcome. Safe to call from a cron worker.
export async function processScheduledMessage(id: string): Promise<void> {
  const row = await prisma.scheduledMessage.findUnique({ where: { id } });
  if (!row || row.status !== 'PENDING') return;

  await prisma.scheduledMessage.update({ where: { id }, data: { status: 'PROCESSING' } });

  const dbUser = await prisma.user.findUnique({
    where: { id: row.userId },
    include: { role: true },
  });
  if (!dbUser || dbUser.isBanned || !dbUser.isActive) {
    await prisma.scheduledMessage.update({
      where: { id },
      data: { status: 'FAILED', lastError: 'sender_unavailable', processedAt: new Date() },
    });
    return;
  }

  const user: CurrentUser = {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    roleName: dbUser.role?.name ?? null,
    permissions: [],
  };

  const recipients = row.recipients as ComposeRecipient[];
  const attachments = (row.attachments as ComposeInput['attachments']) ?? undefined;

  const res = await sendComposed(user, {
    from: row.fromAddress,
    recipients,
    subject: row.subject ?? undefined,
    text: row.bodyText ?? undefined,
    html: row.bodyHtml ?? undefined,
    attachments,
  });

  await prisma.scheduledMessage.update({
    where: { id },
    data: {
      status: res.failed > 0 && res.sent === 0 ? 'FAILED' : 'SENT',
      sentCount: res.sent,
      failedCount: res.failed,
      lastError: res.errors[0]?.error ?? null,
      processedAt: new Date(),
    },
  });
}
