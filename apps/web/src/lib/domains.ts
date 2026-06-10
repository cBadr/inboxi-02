import { prisma } from '@inboxi/db';

// Domains a user may create mailboxes on: all FREE active domains, plus any
// domain assigned directly to the user or to a group they belong to.
export async function getAvailableDomains(userId: string) {
  const groupIds = (
    await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } })
  ).map((g) => g.groupId);

  return prisma.domain.findMany({
    where: {
      isActive: true,
      OR: [
        { availability: 'FREE' },
        { assignments: { some: { userId } } },
        groupIds.length ? { assignments: { some: { groupId: { in: groupIds } } } } : { id: '' },
      ],
    },
    orderBy: { name: 'asc' },
  });
}
