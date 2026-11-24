import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../../src/server/db/client.ts";
import { duplicateConfirmations, reports } from "../../src/server/db/schema.ts";
import { useTestDb } from "../helpers/db.ts";
import {
  makeAccount,
  makeBuilding,
  makeCampus,
  makeCategory,
  makeReport,
  makeSpace,
} from "../helpers/factories.ts";

describe("schema constraints", () => {
  useTestDb();

  it("RF-REPORTE-13: a report cannot point to a building of another campus", async () => {
    const a = await makeCampus();
    const b = await makeCampus();
    const buildingOfB = await makeBuilding({ campusId: b.id });
    const spaceOfB = await makeSpace({ buildingId: buildingOfB.id });
    const categoryOfA = await makeCategory({ campusId: a.id });

    await expect(
      makeReport({ campusId: a.id, buildingId: buildingOfB.id, spaceId: spaceOfB.id, categoryId: categoryOfA.id }),
    ).rejects.toThrow();
  });

  it("RF-GESTION-08: an In review report must have an assignee", async () => {
    await expect(makeReport({ status: "in_review" })).rejects.toThrow();
    const staff = await makeAccount();
    await expect(makeReport({ status: "in_review", assigneeId: staff.id })).resolves.toBeDefined();
  });

  it("RF-CATALOGO-08: catalog name keys are unique per campus, not across campuses", async () => {
    const a = await makeCampus();
    const b = await makeCampus();
    await makeBuilding({ campusId: a.id, name: "Biblioteca", nameKey: "biblioteca" });
    await expect(
      makeBuilding({ campusId: a.id, name: "BIBLIOTECA", nameKey: "biblioteca" }),
    ).rejects.toThrow();
    await expect(
      makeBuilding({ campusId: b.id, name: "Biblioteca", nameKey: "biblioteca" }),
    ).resolves.toBeDefined();
  });

  it("RF-DUPLICADO-05: an account cannot confirm the same report twice", async () => {
    const report = await makeReport();
    const account = await makeAccount();
    const row = { reportId: report.id, accountId: account.id };
    await getDb().insert(duplicateConfirmations).values(row);
    await expect(getDb().insert(duplicateConfirmations).values(row)).rejects.toThrow();
  });

  it("is_open follows the report status", async () => {
    const open = await makeReport({ status: "new" });
    const closed = await makeReport({ status: "resolved" });
    const read = async (id: string) =>
      (await getDb().select({ isOpen: reports.isOpen }).from(reports).where(eq(reports.id, id)))[0]?.isOpen;
    expect(await read(open.id)).toBe(true);
    expect(await read(closed.id)).toBe(false);
  });
});
