import type { CampusRoles } from '../domain/permissions'

/**
 * The authenticated account plus its role in each campus (SDD 10.3).
 * `roles` is the same type `can()` receives, so a Viewer's roles can be
 * passed to it directly. No entry for a campus means Reporter (DD-06).
 */
export type Viewer = {
  accountId: string
  email: string
  roles: CampusRoles
}