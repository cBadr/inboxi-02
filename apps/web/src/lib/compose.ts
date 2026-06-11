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
  const emailid = recipient.email.split('@')[0] ?? '';
  return {
    ...vars,
    to: recipient.email,
    email: recipient.email,
    emailid, // local part of the recipient address (before the @)
    from,
    domain: from.split('@')[1] ?? '',
    date: new Date().toLocaleDateString(),
    recipient: { email: recipient.email, emailid, ...vars },
  };
}

function pickLetter(input: Omit<ComposeInput, 'scheduleAt'>, i: number): string | undefined {
  const single = (input.format === 'html' ? input.html : input.text) ?? input.html ?? input.text;
  return pickRotated(single, input.letters, input.letterMode, i);
}

// Pick an item for recipient #i from an optional pool: rotate sequentially (by
// index) or at random; fall back to the single value otherwise.
function pickRotated(
  single: string | undefined,
  pool: string[] | undefined,
  mode: 'single' | 'sequential' | 'random' | undefined,
  i: number,
): string | undefined {
  const list = pool ?? [];
  if ((mode === 'sequential' || mode === 'random') && list.length > 0) {
    return mode === 'sequential' ? list[i % list.length] : list[Math.floor(Math.random() * list.length)];
  }
  return single && single.trim() ? single : undefined;
}

function pickFromName(input: Omit<ComposeInput, 'scheduleAt'>, i: number): string | undefined {
  return pickRotated(input.fromName, input.fromNames, input.fromNameMode, i);
}
function pickSubject(input: Omit<ComposeInput, 'scheduleAt'>, i: number): string | undefined {
  return pickRotated(input.subject, input.subjects, input.subjectMode, i);
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

  const offset = input.indexOffset ?? 0;
  const format = input.format ?? (input.html != null ? 'html' : 'text');
  for (let i = 0; i < input.recipients.length; i++) {
    const recipient = input.recipients[i]!;
    const gi = offset + i; // global rotation index across throttled batches
    // Resolve a (possibly random) from-address first, then expose it in the
    // context so the body can reference {{from}} consistently.
    const from = renderMessage(input.from, contextFor(input.from, recipient));
    const ctx = contextFor(from, recipient);
    const subjectTpl = pickSubject(input, gi);
    const subject = subjectTpl ? renderMessage(subjectTpl, ctx) : undefined;
    const letterTpl = pickLetter(input, gi);
    const body = letterTpl ? renderMessage(letterTpl, ctx) : undefined;
    const fromName = pickFromName(input, gi);

    const r = await sendMail(user, {
      from,
      fromName: fromName ? renderMessage(fromName, ctx) : undefined,
      to: recipient.email,
      subject,
      text: format === 'text' ? body : undefined,
      html: format === 'html' ? body : undefined,
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
      fromName: input.fromName ?? null,
      fromNames: input.fromNames ?? undefined,
      fromNameMode: input.fromNameMode ?? null,
      subject: input.subject ?? null,
      subjects: input.subjects ?? undefined,
      subjectMode: input.subjectMode ?? null,
      bodyText: input.text ?? null,
      bodyHtml: input.html ?? null,
      format: input.format ?? null,
      letters: input.letters ?? undefined,
      letterMode: input.letterMode ?? null,
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
    subjects: (row.subjects as string[] | null) ?? undefined,
    subjectMode: (row.subjectMode as ComposeInput['subjectMode']) ?? undefined,
    text: row.bodyText ?? undefined,
    html: row.bodyHtml ?? undefined,
    format: (row.format as ComposeInput['format']) ?? undefined,
    letters: (row.letters as string[] | null) ?? undefined,
    letterMode: (row.letterMode as ComposeInput['letterMode']) ?? undefined,
    attachments,
    fromName: row.fromName ?? undefined,
    fromNames: (row.fromNames as string[] | null) ?? undefined,
    fromNameMode: (row.fromNameMode as ComposeInput['fromNameMode']) ?? undefined,
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
