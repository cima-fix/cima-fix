import { listReports } from '../../lib/demo-api'
import { DESKTOP_QUERY, matchesMedia } from '../../lib/media'

// / — the counts and the urgent reports only show on desktop (lg), so a phone skips the
// request. `reports` is null when it was skipped; HomePage reloads if the screen grows.
export async function homeLoader() {
  return { reports: matchesMedia(DESKTOP_QUERY) ? await listReports() : null }
}
