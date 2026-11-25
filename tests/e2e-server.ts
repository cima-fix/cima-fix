import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

import { PGlite } from '@electric-sql/pglite'
import { serve } from '@hono/node-server'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { cors } from 'hono/cors'

import { CAMPUS, CREDENTIAL_PREFIX, DB_COOKIE, EMAIL, LINK, REPORT } from '../e2e/seed.ts'
import { createApp } from '../src/server/app.ts'
import { setDb, type Database } from '../src/server/db/client.ts'
import * as schema from '../src/server/db/schema.ts'
import type { PhotoStorage } from '../src/server/integrations/cloudinary.ts'
import { setPhotoStorage } from '../src/server/integrations/cloudinary.ts'
import { ExternalServiceUnavailable } from '../src/server/integrations/errors.ts'
import { InvalidCredential, setIdentityVerifier } from '../src/server/integrations/google-identity.ts'
import { setMailer } from '../src/server/integrations/mailer.ts'
import { nameKey } from '../src/shared/domain/names.ts'

/*
  Local API for the end-to-end tests (SDD 16): the real Hono app on an in-process PostgreSQL
  (PGlite) with the real migrations, and fake Google, Cloudinary and Resend (the same seams the
  integration tests use). Never used outside the tests.

  Each test gets its own copy of the seeded database (a PGlite clone), chosen by the DB_COOKIE
  cookie, so tests that change data can run in parallel. Requests without that cookie (a person
  trying the app by hand) use a shared copy.

    node tests/e2e-server.ts            # port 8788, or PORT
*/

const PORT = Number(process.env.PORT ?? 8788)
const ORIGIN = `http://localhost:${PORT}`

// ---------------------------------------------------------------------------------------------
// One database per test
// ---------------------------------------------------------------------------------------------

type Tenant = { client: PGlite; db: Database }
const current = new AsyncLocalStorage<Tenant>()

// Every getDb() of the app resolves to the database of the request being handled.
setDb(
  new Proxy({} as Database, {
    get(_, property) {
      const tenant = current.getStore()
      if (!tenant) throw new Error('e2e: no database for this request')
      const value = Reflect.get(tenant.db, property, tenant.db)
      return typeof value === 'function' ? value.bind(tenant.db) : value
    },
  }),
)

const open = (client: PGlite): Tenant => ({ client, db: drizzle({ client, schema }) as Database })

// ---------------------------------------------------------------------------------------------
// Fake external services
// ---------------------------------------------------------------------------------------------

// `e2e:<email>` signs in as that email; `e2e:down` is Google being unreachable.
setIdentityVerifier({
  async verify(credential) {
    if (!credential.startsWith(CREDENTIAL_PREFIX)) throw new InvalidCredential()
    const email = credential.slice(CREDENTIAL_PREFIX.length)
    if (email === 'down') throw new ExternalServiceUnavailable('google')
    const domain = email.split('@')[1]
    return { email, emailVerified: true, hostedDomain: domain === 'uabc.edu.mx' ? domain : undefined }
  },
})

setMailer({ async send() {} })

const FOLDER = 'e2e'
const photoUrl = (publicId: string) => `${ORIGIN}/__e2e/photos/${encodeURIComponent(publicId)}`

// Uploads go to /__e2e/cloudinary/upload on this server instead of Cloudinary.
const fakeStorage: PhotoStorage = {
  signUpload(now) {
    return {
      uploadUrl: `${ORIGIN}/__e2e/cloudinary/upload`,
      apiKey: 'e2e',
      timestamp: Math.floor(now.getTime() / 1000),
      folder: FOLDER,
      allowedFormats: 'jpg,png,webp,heic',
      signature: 'e2e',
    }
  },
  isAuthentic: (photo) => photo.publicId.startsWith(`${FOLDER}/`) && photo.signature === 'e2e',
  urls: (photo) => ({ url: photoUrl(photo.publicId), thumbnailUrl: photoUrl(photo.publicId) }),
  floorPlanUrl: () => `${ORIGIN}/__e2e/plan.svg`,
  async listUploads() {
    return { uploads: [], nextCursor: undefined }
  },
  async deleteUploads() {},
  async uploadFloorPlan() {
    throw new Error('e2e: not available')
  },
}
setPhotoStorage(fakeStorage)

// ---------------------------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------------------------

async function seed() {
  const db = template.db
  const one = <T>(rows: T[]) => rows[0] as T

  const campus = one(
    await db
      .insert(schema.campuses)
      .values({
        slug: CAMPUS.slug,
        name: CAMPUS.name,
        floorPlanPublicId: `${FOLDER}/plans/sauzal`,
        floorPlanWidth: 2000,
        floorPlanHeight: 1200,
        alertThresholdNew: 5,
        mapThresholdMedium: 3,
        mapThresholdHigh: 6,
      })
      .returning(),
  )

  const signedIn = new Date('2026-09-01T16:00:00Z')
  const account = async (email: string, firstLoginAt: Date | null = signedIn) =>
    one(await db.insert(schema.accounts).values({ email, firstLoginAt }).returning())
  const staff = await account(EMAIL.staff)
  const carlos = await account(EMAIL.carlos)
  const mariana = await account(EMAIL.mariana)
  const jorge = await account(EMAIL.jorge)
  const admin = await account(EMAIL.admin)
  const director = await account(EMAIL.director, null)
  const ana = await account(EMAIL.ana)
  const other = await account(EMAIL.other)

  await db.insert(schema.campusRoles).values([
    ...[staff, carlos, mariana, jorge].map((a) => ({ campusId: campus.id, accountId: a.id, role: 'staff' as const })),
    ...[admin, director].map((a) => ({ campusId: campus.id, accountId: a.id, role: 'admin' as const })),
  ])

  // Positions are coordinates of the 2000 × 1200 plan (DD-12), with y measured from the bottom
  // edge as Leaflet's CRS.Simple does (SDD 13.4).
  const building = async (name: string, x: number | null, y: number | null) =>
    one(
      await db
        .insert(schema.buildings)
        .values({ campusId: campus.id, name, nameKey: nameKey(name), positionX: x, positionY: y })
        .returning(),
    )
  const edificio2 = await building('Edificio 2', 1160, 912)
  const edificio5 = await building('Edificio 5', 1480, 336)
  const biblioteca = await building('Biblioteca', 440, 912)

  const space = async (buildingId: string, name: string, linkCode: string, isActive = true) =>
    one(
      await db
        .insert(schema.spaces)
        .values({ buildingId, name, nameKey: nameKey(name), linkCode, isActive })
        .returning(),
    )
  const laboratorio3 = await space(edificio2.id, 'Laboratorio 3', LINK.laboratorio3)
  await space(edificio2.id, 'Salón 201', LINK.salon201)
  await space(edificio2.id, 'Salón 202', LINK.salon202, false)
  const salon112 = await space(edificio5.id, 'Salón 112', LINK.salon112)
  const salon204 = await space(edificio5.id, 'Salón 204', LINK.salon204)
  const plantaBaja = await space(biblioteca.id, 'Planta baja', LINK.plantaBaja)
  await space(biblioteca.id, 'Planta alta', LINK.plantaAlta)

  const category = async (name: string, severity: 1 | 2 | 3, isActive = true) =>
    one(
      await db
        .insert(schema.categories)
        .values({ campusId: campus.id, name, nameKey: nameKey(name), severity, isActive })
        .returning(),
    )
  const iluminacion = await category('Iluminación', 2)
  const red = await category('Red e internet', 2)
  const limpieza = await category('Limpieza', 1)
  await category('Mobiliario', 1)
  await category('Jardinería', 1, false)

  const base = { campusId: campus.id }
  await db.insert(schema.reports).values([
    {
      ...base, id: REPORT.r1, buildingId: edificio5.id, spaceId: salon204.id, categoryId: iluminacion.id,
      description: 'No enciende la lámpara de la izquierda.', status: 'new', priority: 3,
      confirmationCount: 6, reporterId: ana.id, createdAt: new Date('2026-11-16T18:32:00Z'),
    },
    {
      ...base, id: REPORT.r2, buildingId: edificio2.id, spaceId: laboratorio3.id, categoryId: red.id,
      description: 'Sin conexión en los equipos del fondo desde el miércoles.', status: 'in_review', priority: 2,
      confirmationCount: 2, reporterId: ana.id, assigneeId: staff.id, createdAt: new Date('2026-11-12T16:10:00Z'),
    },
    {
      ...base, id: REPORT.r3, buildingId: edificio5.id, spaceId: salon112.id, categoryId: iluminacion.id,
      description: 'La lámpara del fondo no enciende desde el lunes.', status: 'new', priority: 3,
      confirmationCount: 4, reporterId: other.id, createdAt: new Date('2026-11-10T17:15:00Z'),
    },
    {
      ...base, id: REPORT.r4, buildingId: edificio5.id, spaceId: salon204.id, categoryId: iluminacion.id,
      description: 'Parpadea la luz del pizarrón.', status: 'in_review', priority: 2,
      confirmationCount: 1, reporterId: other.id, assigneeId: carlos.id, createdAt: new Date('2026-11-13T00:40:00Z'),
    },
    {
      ...base, id: REPORT.r5, buildingId: biblioteca.id, spaceId: plantaBaja.id, categoryId: limpieza.id,
      description: 'Derrame en el pasillo.', status: 'resolved', priority: 1, reporterId: staff.id,
      assigneeId: mariana.id, createdAt: new Date('2026-11-14T16:20:00Z'), resolvedAt: new Date('2026-11-14T21:05:00Z'),
    },
    {
      ...base, id: REPORT.r6, buildingId: edificio5.id, spaceId: salon112.id, categoryId: iluminacion.id,
      description: 'El apagador de la entrada no funciona.', status: 'new', priority: 2,
      reporterId: staff.id, createdAt: new Date('2026-11-17T17:00:00Z'),
    },
  ])
  await db.insert(schema.duplicateConfirmations).values({ reportId: REPORT.r4, accountId: staff.id })
}

// ---------------------------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------------------------

// The seeded database every test starts from.
const template = open(new PGlite())
await migrate(template.db as Parameters<typeof migrate>[0], { migrationsFolder: './drizzle' })
await current.run(template, seed)

const tenants = new Map<string, Tenant>()
const shared = open((await template.client.clone()) as PGlite)

const app = createApp()

// A tiny campus plan for the map, and one picture for every photo.
const PLAN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1200" viewBox="0 0 2000 1200">
<rect width="2000" height="1200" fill="#eef2ee"/>
<g fill="#ffffff" stroke="#c7cfc7" stroke-width="4">
<rect x="1000" y="160" width="320" height="256" rx="16"/><rect x="1320" y="736" width="320" height="256" rx="16"/>
<rect x="280" y="160" width="320" height="256" rx="16"/></g></svg>`
const PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e4f2ea"/></svg>`

const server = new Hono()
  .post('/__e2e/databases', async (c) => {
    const id = randomUUID()
    tenants.set(id, open((await template.client.clone()) as PGlite))
    return c.json({ id })
  })
  .delete('/__e2e/databases/:id', async (c) => {
    const tenant = tenants.get(c.req.param('id'))
    tenants.delete(c.req.param('id'))
    await tenant?.client.close()
    return c.body(null, 204)
  })
  .get('/__e2e/plan.svg', (c) => c.body(PLAN_SVG, 200, { 'content-type': 'image/svg+xml' }))
  .get('/__e2e/photos/:id', (c) => c.body(PHOTO_SVG, 200, { 'content-type': 'image/svg+xml' }))
  // Stand-in for Cloudinary's upload endpoint (SDD 8.2). Called by the browser from the SPA's
  // origin, hence CORS.
  .use('/__e2e/cloudinary/*', cors({ origin: (origin) => origin }))
  .post('/__e2e/cloudinary/upload', async (c) => {
    const body = await c.req.parseBody()
    const file = body.file
    if (!(file instanceof File)) return c.json({ error: { message: 'Missing file' } }, 400)
    const extension = file.name.split('.').pop()?.toLowerCase()
    return c.json({
      public_id: `${FOLDER}/${randomUUID()}`,
      version: 1,
      signature: 'e2e',
      format: extension === 'jpeg' ? 'jpg' : extension,
      bytes: file.size,
    })
  })
  .all('/api/*', async (c) => {
    const tenant = tenants.get(getCookie(c, DB_COOKIE) ?? '') ?? shared
    const response = await current.run(tenant, () => app.fetch(c.req.raw))
    // The session cookie is `Secure`; WebKit only stores those on https, so it is dropped for
    // http://localhost here. Only this test server does it.
    const cookies = response.headers.getSetCookie()
    if (cookies.length === 0) return response
    const headers = new Headers(response.headers)
    headers.delete('set-cookie')
    for (const cookie of cookies) headers.append('set-cookie', cookie.replace(/;\s*Secure/i, ''))
    return new Response(response.body, { status: response.status, headers })
  })

serve({ fetch: server.fetch, port: PORT }, () => {
  console.log(`e2e API listening on ${ORIGIN}`)
})
