import { getCampusMap, getCatalog } from '../../lib/demo-api'

// Data is loaded when the route opens, never in the background (RF-MAPA-20).
export async function mapLoader() {
  const [buildings, catalog] = await Promise.all([getCampusMap(), getCatalog()])
  return { buildings, campus: catalog.campuses[0] ?? '' }
}
