// Data of the end-to-end tests: the local test API (tests/e2e-server.ts) loads it in every test
// database, and the specs use the same values to find it. Plain constants, no imports, so both
// the API (Node) and Playwright can read this file.

// Port of the local test API (tests/e2e-server.ts).
export const API_PORT = 8788

export const CAMPUS = { slug: 'sauzal', name: 'UABC Campus Sauzal' }

export const EMAIL = {
  // Encargado of the campus: the account the tests sign in with by default.
  staff: 'laura.martinez@uabc.edu.mx',
  carlos: 'carlos.ruiz@uabc.edu.mx',
  mariana: 'mariana.torres@uabc.edu.mx',
  jorge: 'jorge.salas@uabc.edu.mx',
  admin: 'coordinacion.sauzal@uabc.edu.mx',
  // Admin who has never signed in.
  director: 'dir.sauzal@uabc.edu.mx',
  // Reportantes: no role in the campus.
  ana: 'ana.lopez@uabc.edu.mx',
  other: 'otra.persona@uabc.edu.mx',
}

// Links of the spaces (RF-CATALOGO-14). Salón 202 is deactivated.
export const LINK = {
  laboratorio3: 'H4TR8WN2CE',
  salon201: 'Q9VM3KD7XA',
  salon202: 'B6YP2ZR8MT',
  salon112: 'M3XK8PD2RW',
  salon204: 'K7P2X9QM4A',
  plantaBaja: 'T5NW7CJ3HE',
  plantaAlta: 'F8RD4YK6PB',
}

// Reports, by the order RF-GESTION-14 gives them for the Encargado.
export const REPORT = {
  // Nuevo, Alta, Edificio 5 · Salón 204, Iluminación, 6 confirmations.
  r1: '0b6f7a3e-1c1d-4e5f-8a90-000000000001',
  // En revisión, assigned to the Encargado, Edificio 2 · Laboratorio 3, Red e internet.
  r2: '0b6f7a3e-1c1d-4e5f-8a90-000000000002',
  // Nuevo, Alta, Edificio 5 · Salón 112, Iluminación, 4 confirmations, the oldest.
  r3: '0b6f7a3e-1c1d-4e5f-8a90-000000000003',
  // En revisión, assigned to carlos, Edificio 5 · Salón 204, confirmed by the Encargado.
  r4: '0b6f7a3e-1c1d-4e5f-8a90-000000000004',
  // Resuelto, Biblioteca · Planta baja, Limpieza, registered by the Encargado.
  r5: '0b6f7a3e-1c1d-4e5f-8a90-000000000005',
  // Nuevo, Media, Edificio 5 · Salón 112, Iluminación, registered by the Encargado.
  r6: '0b6f7a3e-1c1d-4e5f-8a90-000000000006',
}

// Prefix of the fake Google credentials the test API accepts: `e2e:<email>` signs in as that
// email, `e2e:down` simulates Google being unreachable (RNF-DISPONIBILIDAD-01).
export const CREDENTIAL_PREFIX = 'e2e:'

// Cookie that tells the test API which test database to use.
export const DB_COOKIE = 'cf_e2e_db'
