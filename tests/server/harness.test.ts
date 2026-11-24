import { count } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "../../src/server/db/client.ts";
import { reports } from "../../src/server/db/schema.ts";
import { requireViewer } from "../../src/server/middleware/viewer.ts";
import { asViewer } from "../helpers/as-viewer.ts";
import { useTestDb } from "../helpers/db.ts";
import { makeCampus, makeReport, makeViewer } from "../helpers/factories.ts";

describe("test harness", () => {
  useTestDb();

  it("creates data in PGlite and calls a route as a given viewer", async () => {
    const campus = await makeCampus();
    await makeReport({ campusId: campus.id });
    await makeReport({ campusId: campus.id });
    const viewer = await makeViewer({ campusId: campus.id, role: "admin" });

    const api = asViewer(viewer, {
      extend: (a) =>
        a.get("/_example/whoami", async (c) => {
          const v = requireViewer(c);
          const [row] = await getDb().select({ n: count() }).from(reports);
          return c.json({ email: v.email, role: v.roles[campus.id], reports: row?.n });
        }),
    });

    const res = await api.get("/api/_example/whoami");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ email: viewer.email, role: "admin", reports: 2 });
  });

  it("answers 401 in the standard format when there is no viewer", async () => {
    const api = asViewer(null, {
      extend: (a) => a.get("/_example/private", (c) => c.json(requireViewer(c))),
    });
    const res = await api.get("/api/_example/private");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });
});
