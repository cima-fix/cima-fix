// Who receives the email of an event (SDD 14.1). The candidates come from the table of 14.1, in
// the campus of the event (RF-NOTIFICACION-12).
export function resolveRecipients(
  candidates: readonly (string | null | undefined)[],
  actorId: string,
  options: { includeActor?: boolean } = {},
): string[] {
  const recipients = new Set<string>()
  for (const accountId of candidates) {
    if (!accountId) continue
    // RF-NOTIFICACION-09: not the account that performed the action, except for alerts (18).
    if (accountId === actorId && options.includeActor !== true) continue
    // RF-NOTIFICACION-10: one email per account and action.
    recipients.add(accountId)
  }
  return [...recipients]
}