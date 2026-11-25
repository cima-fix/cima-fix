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
