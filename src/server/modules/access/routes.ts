import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

import { assignRoleBody, googleLoginBody, roleParams } from '../../../shared/schemas/access.ts'
import { idParam } from '../../../shared/schemas/common.ts'
import { loginRateLimit } from '../../middleware/rate-limit.ts'
import { sessionRequired } from '../../middleware/session-required.ts'
import { validate } from '../../middleware/validate.ts'
import { requireViewer } from '../../middleware/viewer.ts'
import type { AppEnv } from '../../types.ts'
import { assignRole, getMe, listRoles, login, logout, removeRole } from './service.ts'
import { SESSION_COOKIE, SESSION_DURATION_MS } from './session-token.ts'

// Access endpoints (SDD 7.2, Acceso). Paths are relative to /api.
export const accessRoutes = new Hono<AppEnv>()
  // The only route without a session besides the cron task: it is the one that creates it.
  .post('/auth/google', loginRateLimit, validate('json', googleLoginBody), async (c) => {
    const { token, me } = await login(c.req.valid('json').credential)
    // SDD 7.1, 11: HttpOnly, Secure, SameSite=Lax, 30 days (RNF-SEGURIDAD-02).
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_DURATION_MS / 1000,
    })
    return c.json(me)
  })
  .post('/auth/logout', sessionRequired, async (c) => {
    requireViewer(c)
    const token = getCookie(c, SESSION_COOKIE)
    if (token) await logout(token)
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true })
    return c.body(null, 204)
  })
  .get('/me', sessionRequired, async (c) => {
    return c.json(await getMe(requireViewer(c)))
  })
  .get('/campuses/:id/roles', sessionRequired, validate('param', idParam), async (c) => {
    return c.json(await listRoles(requireViewer(c), c.req.valid('param').id))
  })
  .put('/campuses/:id/roles', sessionRequired, validate('param', idParam), validate('json', assignRoleBody), async (c) => {
    return c.json(await assignRole(requireViewer(c), c.req.valid('param').id, c.req.valid('json')))
  })
  .delete('/campuses/:id/roles/:accountId', sessionRequired, validate('param', roleParams), async (c) => {
    const { id, accountId } = c.req.valid('param')
    await removeRole(requireViewer(c), id, accountId)
    return c.body(null, 204)
  })