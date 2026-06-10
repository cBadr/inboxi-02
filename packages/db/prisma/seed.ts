import { PrismaClient, DomainAvailability, MailboxType, NotificationChannel } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Core permission keys grouped by area. Extend freely; the admin "control
// everything" surface maps onto these.
const PERMISSIONS: Array<[string, string]> = [
  ['domain.manage', 'Create, edit, assign, and remove domains'],
  ['domain.dns', 'Trigger DNS automation for domains'],
  ['user.manage', 'Create, edit, ban users'],
  ['role.manage', 'Manage roles and permissions'],
  ['plan.manage', 'Manage plans and pricing'],
  ['mailbox.manage', 'Manage mailboxes'],
  ['mail.send', 'Send outbound mail'],
  ['delivery.manage', 'Configure delivery transports'],
  ['cms.manage', 'Manage CMS pages and blocks'],
  ['seo.manage', 'Manage SEO settings'],
  ['ads.manage', 'Manage ads and zones'],
  ['integration.manage', 'Manage external integrations'],
  ['analytics.view', 'View analytics and monitoring'],
  ['settings.manage', 'Manage global settings'],
  ['abuse.manage', 'Review abuse reports and ban senders'],
];

async function main() {
  // Permissions
  await Promise.all(
    PERMISSIONS.map(([key, description]) =>
      prisma.permission.upsert({
        where: { key },
        update: { description },
        create: { key, description },
      }),
    ),
  );
  const allPermissions = await prisma.permission.findMany();

  // Roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', description: 'Full platform administrator', isSystem: true },
  });
  const userRole = await prisma.role.upsert({
    where: { name: 'user' },
    update: {},
    create: { name: 'user', description: 'Standard registered user', isSystem: true },
  });

  // Admin gets all permissions
  await Promise.all(
    allPermissions.map((p) =>
      prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
        update: {},
        create: { roleId: adminRole.id, permissionId: p.id },
      }),
    ),
  );

  // Admin user (dev credentials — change in production)
  const adminEmail = 'admin@inboxi.online';
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { roleId: adminRole.id },
    create: {
      email: adminEmail,
      name: 'Administrator',
      passwordHash: await bcrypt.hash('admin12345', 12),
      roleId: adminRole.id,
      emailVerified: new Date(),
    },
  });

  // Plans
  await prisma.plan.upsert({
    where: { slug: 'free' },
    update: {},
    create: {
      slug: 'free',
      name: 'Free',
      description: 'Limited disposable inboxes to try the service',
      isFree: true,
      priceUsd: 0,
      maxMailboxes: 3,
      maxDomains: 0,
      dailySendQuota: 0,
      dailyReceiveQuota: 100,
      retentionDays: 1,
      sortOrder: 0,
    },
  });
  await prisma.plan.upsert({
    where: { slug: 'pro' },
    update: {},
    create: {
      slug: 'pro',
      name: 'Pro',
      description: 'More mailboxes, sending, and a custom domain',
      priceUsd: 9.99,
      maxMailboxes: 25,
      maxDomains: 1,
      dailySendQuota: 200,
      dailyReceiveQuota: 5000,
      retentionDays: 30,
      sortOrder: 1,
      features: { api: true, webhooks: true, forwarding: true, otpExtraction: true },
    },
  });

  // Platform domain + catch-all mailbox
  const domain = await prisma.domain.upsert({
    where: { name: 'inboxi.online' },
    update: {},
    create: {
      name: 'inboxi.online',
      availability: DomainAvailability.FREE,
      dkimSelector: 'inboxi',
    },
  });
  const catchAll = await prisma.mailbox.upsert({
    where: { address: `catch-all@${domain.name}` },
    update: {},
    create: {
      address: `catch-all@${domain.name}`,
      localPart: 'catch-all',
      domainId: domain.id,
      type: MailboxType.CATCH_ALL,
    },
  });
  await prisma.domain.update({
    where: { id: domain.id },
    data: { catchAllMailboxId: catchAll.id },
  });

  // Notification templates
  await prisma.notificationTemplate.upsert({
    where: { key: 'mail.received' },
    update: {},
    create: {
      key: 'mail.received',
      channel: NotificationChannel.TELEGRAM,
      name: 'New mail received',
      body: '📩 New email for {{mailbox.address}}\nFrom: {{message.from}}\nSubject: {{message.subject}}',
      variables: {
        'mailbox.address': 'Recipient mailbox',
        'message.from': 'Sender address',
        'message.subject': 'Subject line',
      },
    },
  });

  // Global settings — temp-mail engine + gate
  const settings: Array<[string, unknown, string]> = [
    ['tempmail.addressPattern', { type: 'alphanumeric', length: 10 }, 'tempmail'],
    ['tempmail.destructionMinutes', 60, 'tempmail'],
    ['tempmail.gateAfterMessages', 3, 'tempmail'],
    ['mail.maxMessageSizeMb', 25, 'mail'],
    ['site.name', 'Inboxi', 'general'],
  ];
  await Promise.all(
    settings.map(([key, value, category]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: value as object },
        create: { key, value: value as object, category },
      }),
    ),
  );

  // eslint-disable-next-line no-console
  console.log('Seed complete:', { adminRole: adminRole.name, userRole: userRole.name, domain: domain.name });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
