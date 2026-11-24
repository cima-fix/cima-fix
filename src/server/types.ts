import type { Viewer } from '../shared/types/viewer.ts'

export type AppEnv = {
  Variables: {
    /** Set by the session middleware (phase 3). `null` = no valid session. */
    viewer: Viewer | null
  }
}
