import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { errorHandler, notFoundHandler } from "./middleware/errors.ts";
import { jsonOnly } from "./middleware/json-only.ts";
import { anonymousSession } from "./middleware/viewer.ts";
import type { AppEnv } from "./types.ts";

export type AppOptions = {
  /** Session middleware. Production default: phase 3 replaces `anonymousSession`. Tests pass `asViewer()`. */
  session?: MiddlewareHandler<AppEnv>;
  /** Tests only: mount extra routes (paths are relative to /api). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extend?: (api: Hono<AppEnv, any, any>) => void;
};

export function createApp(options: AppOptions = {}) {
  const api = new Hono<AppEnv>()
    .use(secureHeaders())
    .use(jsonOnly)
    .use(options.session ?? anonymousSession);
  // ── Module routes: each block adds ONE line per module (work plan, section 7) ──
  // .route("/", accessRoutes)
  options.extend?.(api);

  const app = new Hono<AppEnv>().route("/api", api);
  app.onError(errorHandler);
  app.notFound(notFoundHandler(app));
  return app;
}

export const app = createApp();
export type AppType = typeof app; // typed client (DD-18)
