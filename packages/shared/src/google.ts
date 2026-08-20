// Platform-wide Google service integrations, configured from Admin -> Google.
//
// These are owned by the PLATFORM, not by a customer: they are stored as
// Integration rows with userId = NULL. Keeping the shapes and validation here
// means the admin form, the server action and the public-site renderer all agree
// on what a valid configuration looks like.

import { z } from 'zod';

/**
 * A GTM container id looks like `GTM-ABC1234`.
 *
 * Accepts lowercase and surrounding whitespace and normalizes, because this
 * value is pasted out of the GTM console and arrives with stray spaces more
 * often than not. An id that is merely mistyped should be rejected here rather
 * than silently rendering a snippet that loads nothing.
 */
export const gtmContainerIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^GTM-[A-Z0-9]{4,10}$/, 'Container ID must look like GTM-ABC1234.');

export const gtmConfigSchema = z.object({
  containerId: gtmContainerIdSchema,
  /**
   * Load the container on signed-in app pages (/admin, /dashboard) as well.
   *
   * Off by default: measuring your own console sessions pollutes the analytics
   * you are trying to read, and it loads third-party tag code into an
   * authenticated surface that handles customer mail.
   */
  includeAppPages: z.boolean().default(false),
});

export type GtmConfig = z.infer<typeof gtmConfigSchema>;

/** Paths never tracked unless includeAppPages is on. */
export const GTM_APP_PATH_PREFIXES = ['/admin', '/dashboard'] as const;

export function gtmShouldLoad(pathname: string, includeAppPages: boolean): boolean {
  if (includeAppPages) return true;
  return !GTM_APP_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
