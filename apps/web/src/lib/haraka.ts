import { writeFile } from 'node:fs/promises';
import { prisma, MailboxType } from '@inboxi/db';

// Regenerate the Haraka inbound host_list (the domains the MTA accepts mail for)
// from the active domains. Haraka watches its config files and reloads on
// change, so no restart is needed. Gated on HARAKA_HOST_LIST_PATH so it only
// runs on the server where the MTA is colocated (no-op in dev).
export async function syncHostList(): Promise<void> {
  const path = process.env.HARAKA_HOST_LIST_PATH;
  if (!path) return;
  try {
    const domains = await prisma.domain.findMany({
      where: { isActive: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    await writeFile(path, domains.map((d) => d.name).join('\n') + '\n', 'utf8');
  } catch {
    /* MTA not colocated or path not writable — ignore */
  }
}

// Ensure a domain has a CATCH_ALL mailbox (the primary address that receives all
// mail for unprovisioned addresses). Optionally (re)assign its owner so the
// assigned user sees unrouted mail in their dashboard.
export async function ensureCatchAllMailbox(
  domainId: string,
  domainName: string,
  userId: string | null = null,
): Promise<void> {
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  if (!domain) return;

  if (domain.catchAllMailboxId) {
    if (userId) {
      await prisma.mailbox
        .update({ where: { id: domain.catchAllMailboxId }, data: { userId } })
        .catch(() => {});
    }
    return;
  }

  const address = `catch-all@${domainName}`;
  const mailbox = await prisma.mailbox.upsert({
    where: { address },
    update: userId ? { userId } : {},
    create: {
      address,
      localPart: 'catch-all',
      domainId,
      type: MailboxType.CATCH_ALL,
      userId,
    },
  });
  await prisma.domain.update({ where: { id: domainId }, data: { catchAllMailboxId: mailbox.id } });
}
