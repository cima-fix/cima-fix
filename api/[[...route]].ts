import { handle } from 'hono/vercel'
import { app } from '../src/server/app.ts'
import { startNotifications } from '../src/server/modules/notifications/service.ts'

// Emails of the domain events, after each COMMIT (SDD 14.1).
startNotifications()

const handler = handle(app)

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const HEAD = handler