export type CampusRole = "staff" | "admin";

/**
 * The authenticated account plus its role in each campus (SDD 10.3).
 * No entry for a campus means Reporter in that campus (DD-06).
 */
export type Viewer = {
  accountId: string;
  email: string;
  roles: Record<string, CampusRole>; // key: campus id
};
