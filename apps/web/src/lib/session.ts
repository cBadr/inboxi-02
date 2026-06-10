import { redirect } from 'next/navigation';
import { prisma } from '@inboxi/db';
import { getAuthSession } from './auth';

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  roleName: string | null;
  permissions: string[];
}

// Load the full current user (with role permissions) from the JWT session.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getAuthSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!user || user.isBanned || !user.isActive) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roleName: user.role?.name ?? null,
    permissions: user.role?.permissions.map((rp) => rp.permission.key) ?? [],
  };
}

// Guard for user pages — redirects to login when unauthenticated.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dashboard');
  return user;
}

// Guard for admin pages — requires the admin role.
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/admin');
  if (user.roleName !== 'admin') redirect('/dashboard');
  return user;
}
