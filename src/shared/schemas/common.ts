import * as z from 'zod'

import { MAX_NAME_LENGTH, textLength } from '../domain/limits'
import { cleanName } from '../domain/names'

// Messages that are not written out in a schema (wrong types, unknown fields) also come out in
// Spanish (RNF-USABILIDAD-03). Every schema module imports this one, so the setting applies
// wherever a schema is used.
z.config(z.locales.es())

// Every entity id is a UUID (SDD DD-15).
export const id = z.uuid({ error: 'El identificador no es válido.' })

// Path parameter of routes such as /api/reports/:id.
export const idParam = z.strictObject({ id })

// Catalog names (SDD 6.2, 10.8): stored cleaned, with 1 to 100 characters. Uniqueness
// (RF-CATALOGO-08) is checked by the database through the name key.
export const catalogName = z
  .string({ error: 'El nombre es obligatorio.' })
  .transform(cleanName)
  .refine((name) => name.length > 0, {
    error: 'El nombre no puede quedar vacío.',
    params: { code: 'NAME_REQUIRED' },
  })
  .refine((name) => textLength(name) <= MAX_NAME_LENGTH, {
    error: `El nombre no puede exceder ${MAX_NAME_LENGTH} caracteres.`,
    params: { code: 'NAME_TOO_LONG' },
  })
