import { serve } from '@hono/node-server'
import { app } from './app.ts'
import { startNotifications } from './modules/notifications/service.ts'

// Emails of the domain events, after each COMMIT (SDD 14.1). Without RESEND_API_KEY they are
// printed in this terminal.
startNotifications()

const port = Number(process.env.PORT ?? 8787)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})