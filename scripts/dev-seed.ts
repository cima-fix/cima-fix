import { parseArgs } from "node:util";

import { eq } from "drizzle-orm";

import { EMAIL, LINK, REPORT } from "../e2e/seed.ts";
import { getDb } from "../src/server/db/client.ts";
import * as schema from "../src/server/db/schema.ts";
import { nameKey } from "../src/shared/domain/names.ts";

// npm run dev:seed -- --campus sauzal
// Fills a campus of the development database with the catalog and reports of the end-to-end
// tests (e2e/seed.ts), so the app can be tried with data (SDD 5.2, scripts/). The campus must
// already exist (npm run campus:create) and have no buildings yet. Reads DATABASE_URL from .env.

// Endpoint of the dev branch of Neon. The script refuses any other database.
const DEV_ENDPOINT = "ep-empty-recipe-bcig7mcq";

const { values } = parseArgs({ options: { campus: { type: "string" } } });

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let host = "";
try {
  host = new URL(process.env.DATABASE_URL ?? "").host;
} catch {
  fail("DATABASE_URL no está definida.");
}
console.log(`Base de datos: ${host}`);
if (!host.startsWith(DEV_ENDPOINT))
  fail("Este script solo corre contra la rama dev de Neon.");
if (!values.campus) fail("Falta --campus <slug>.");

const db = getDb();
const one = <T>(rows: T[]) => rows[0] as T;

const campus = (
  await db
    .select()
    .from(schema.campuses)
    .where(eq(schema.campuses.slug, values.campus))
)[0];
if (!campus)
  fail(
    `No existe el campus "${values.campus}". Créalo antes con npm run campus:create.`,
  );
const existing = await db
  .select()
  .from(schema.buildings)
  .where(eq(schema.buildings.campusId, campus.id));
if (existing.length > 0)
  fail(`El campus "${campus.slug}" ya tiene edificios; no se cargó nada.`);

const daysAgo = (days: number, hour = 9) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour + 8, 0, 0, 0); // local time of Ensenada (UTC-8)
  return date;
};

try {
  await db.transaction(async (tx) => {
    // Accounts that never signed in; the staff ones get the Encargado role.
    const account = async (email: string) => {
      await tx.insert(schema.accounts).values({ email }).onConflictDoNothing();
      return one(
        await tx
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.email, email)),
      );
    };
    const staff = await account(EMAIL.staff);
    const carlos = await account(EMAIL.carlos);
    const mariana = await account(EMAIL.mariana);
    const jorge = await account(EMAIL.jorge);
    const ana = await account(EMAIL.ana);
    const other = await account(EMAIL.other);
    await tx
      .insert(schema.campusRoles)
      .values(
        [staff, carlos, mariana, jorge].map((a) => ({
          campusId: campus.id,
          accountId: a.id,
          role: "staff" as const,
        })),
      )
      .onConflictDoNothing();

    // Positions as fractions of the plan, with y from the bottom edge (SDD 13.4). They are
    // placeholders: move them to the real buildings in Catálogo.
    const building = async (name: string, fx: number, fy: number) =>
      one(
        await tx
          .insert(schema.buildings)
          .values({
            campusId: campus.id,
            name,
            nameKey: nameKey(name),
            positionX: Math.round(fx * campus.floorPlanWidth),
            positionY: Math.round(fy * campus.floorPlanHeight),
          })
          .returning(),
      );
    const edificio2 = await building("Edificio 2", 0.58, 0.76);
    const edificio5 = await building("Edificio 5", 0.74, 0.28);
    const biblioteca = await building("Biblioteca", 0.22, 0.76);

    const space = async (
      buildingId: string,
      name: string,
      linkCode: string,
      isActive = true,
    ) =>
      one(
        await tx
          .insert(schema.spaces)
          .values({
            buildingId,
            name,
            nameKey: nameKey(name),
            linkCode,
            isActive,
          })
          .returning(),
      );
    const laboratorio3 = await space(
      edificio2.id,
      "Laboratorio 3",
      LINK.laboratorio3,
    );
    await space(edificio2.id, "Salón 201", LINK.salon201);
    await space(edificio2.id, "Salón 202", LINK.salon202, false);
    const salon112 = await space(edificio5.id, "Salón 112", LINK.salon112);
    const salon204 = await space(edificio5.id, "Salón 204", LINK.salon204);
    const plantaBaja = await space(
      biblioteca.id,
      "Planta baja",
      LINK.plantaBaja,
    );
    await space(biblioteca.id, "Planta alta", LINK.plantaAlta);

    const category = async (
      name: string,
      severity: 1 | 2 | 3,
      isActive = true,
    ) =>
      one(
        await tx
          .insert(schema.categories)
          .values({
            campusId: campus.id,
            name,
            nameKey: nameKey(name),
            severity,
            isActive,
          })
          .returning(),
      );
    const iluminacion = await category("Iluminación", 2);
    const red = await category("Red e internet", 2);
    const limpieza = await category("Limpieza", 1);
    await category("Mobiliario", 1);
    await category("Jardinería", 1, false);

    const base = { campusId: campus.id };
    await tx.insert(schema.reports).values([
      {
        ...base,
        id: REPORT.r1,
        buildingId: edificio5.id,
        spaceId: salon204.id,
        categoryId: iluminacion.id,
        description: "No enciende la lámpara de la izquierda.",
        status: "new",
        priority: 3,
        confirmationCount: 6,
        reporterId: ana.id,
        createdAt: daysAgo(1, 10),
      },
      {
        ...base,
        id: REPORT.r2,
        buildingId: edificio2.id,
        spaceId: laboratorio3.id,
        categoryId: red.id,
        description:
          "Sin conexión en los equipos del fondo desde el miércoles.",
        status: "in_review",
        priority: 2,
        confirmationCount: 2,
        reporterId: ana.id,
        assigneeId: staff.id,
        createdAt: daysAgo(5, 8),
      },
      {
        ...base,
        id: REPORT.r3,
        buildingId: edificio5.id,
        spaceId: salon112.id,
        categoryId: iluminacion.id,
        description: "La lámpara del fondo no enciende desde el lunes.",
        status: "new",
        priority: 3,
        confirmationCount: 4,
        reporterId: other.id,
        createdAt: daysAgo(7, 9),
      },
      {
        ...base,
        id: REPORT.r4,
        buildingId: edificio5.id,
        spaceId: salon204.id,
        categoryId: iluminacion.id,
        description: "Parpadea la luz del pizarrón.",
        status: "in_review",
        priority: 2,
        confirmationCount: 1,
        reporterId: other.id,
        assigneeId: carlos.id,
        createdAt: daysAgo(4, 16),
      },
      {
        ...base,
        id: REPORT.r5,
        buildingId: biblioteca.id,
        spaceId: plantaBaja.id,
        categoryId: limpieza.id,
        description: "Derrame en el pasillo.",
        status: "resolved",
        priority: 1,
        reporterId: staff.id,
        assigneeId: mariana.id,
        createdAt: daysAgo(3, 8),
        resolvedAt: daysAgo(3, 13),
      },
      {
        ...base,
        id: REPORT.r6,
        buildingId: edificio5.id,
        spaceId: salon112.id,
        categoryId: iluminacion.id,
        description: "El apagador de la entrada no funciona.",
        status: "new",
        priority: 2,
        reporterId: staff.id,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ]);
    await tx
      .insert(schema.duplicateConfirmations)
      .values({ reportId: REPORT.r4, accountId: staff.id });
  });
} catch (error) {
  console.error("No se cargó nada; la base quedó como estaba.");
  console.error(error);
  process.exit(1);
}

console.log(
  `Datos de desarrollo cargados en "${campus.name}": 3 edificios, 7 espacios, 5 categorías, 6 reportes.`,
);
process.exit(0);
