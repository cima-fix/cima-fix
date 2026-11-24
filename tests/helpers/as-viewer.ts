import { createApp, type AppOptions } from "../../src/server/app.ts";
import type { Viewer } from "../../src/shared/types/viewer.ts";

/**
 * Calls the API as any account (or as nobody with `null`), without the real session
 * middleware. Paths include the /api prefix. Non-GET requests are sent as JSON.
 */
export function asViewer(viewer: Viewer | null, options: Pick<AppOptions, "extend"> = {}) {
  const app = createApp({
    ...options,
    session: async (c, next) => {
      c.set("viewer", viewer);
      await next();
    },
  });

  const send = (method: string) => (path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: method === "GET" ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  return {
    app,
    get: send("GET"),
    post: send("POST"),
    put: send("PUT"),
    patch: send("PATCH"),
    delete: send("DELETE"),
  };
}
