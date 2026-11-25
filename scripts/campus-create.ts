import { parseArgs } from 'node:util'

import { CampusCreationError, createCampus } from '../src/server/modules/catalog/create-campus.ts'

// npm run campus:create -- --slug valle-dorado --name "UABC Campus Valle Dorado" \
//   --floor-plan ./planos/valle-dorado.png --admin correo@uabc.edu.mx
// (SDD 15.4). Reads DATABASE_URL and the Cloudinary variables from .env.

const { values } = parseArgs({
  options: {
    slug: { type: 'string' },
    name: { type: 'string' },
    'floor-plan': { type: 'string' },
    admin: { type: 'string' },
  },
})

// The script writes wherever .env points (SDD 15.2): show it before writing anything.
function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? '').host
  } catch {
    return '(DATABASE_URL no está definida)'
  }
}
console.log(`Base de datos: ${databaseHost()}`)
console.log(`Folder de Cloudinary: ${process.env.CLOUDINARY_FOLDER ?? '(CLOUDINARY_FOLDER no está definida)'}`)

try {
  const campus = await createCampus({
    slug: values.slug ?? '',
    name: values.name ?? '',
    floorPlan: values['floor-plan'] ?? '',
    admin: values.admin ?? '',
  })
  console.log(`Campus "${campus.name}" creado (${campus.slug}, id ${campus.id}).`)
  console.log(`Plano: ${campus.floorPlanPublicId}, ${campus.floorPlanWidth} × ${campus.floorPlanHeight} px.`)
  process.exit(0)
} catch (error) {
  console.error(error instanceof CampusCreationError ? error.message : error)
  process.exit(1)
}
