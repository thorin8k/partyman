import { applySecurityHeaders } from "./security-headers";
import { createRateLimiter, rateLimitRule } from "./rate-limit";
import { checkCsrf } from "../auth/guards";

// 256 KiB per shared HTTP conventions.
export const MAX_JSON_BYTES = 256 * 1024;

type Handler = (req: Request, server?: any) => Response | Promise<Response>;
type RouteMap = Record<string, Record<string, Handler>>;

// Single composition point: body limit + rate limit before, headers after.
// Bun.serve has no middleware chain, so backend.ts wraps the merged route map.
export function hardenRoutes<T extends RouteMap>(routes: T, opts?: { dev?: boolean; limiter?: ReturnType<typeof createRateLimiter> }): T {
  const dev = opts?.dev ?? process.env.NODE_ENV !== "production";
  const limiter = opts?.limiter ?? createRateLimiter();
  const out: RouteMap = {};
  for (const [path, methods] of Object.entries(routes)) {
    out[path] = {};
    for (const [method, handler] of Object.entries(methods)) {
      out[path][method] = async (req: Request, server?: any) => {
        const len = req.headers.get("content-length");
        if (len && Number(len) > MAX_JSON_BYTES) {
          return applySecurityHeaders(
            Response.json({ error: { code: "BODY_TOO_LARGE", message: "Request body too large" } }, { status: 413 }),
            dev
          );
        }
        const ip = server?.requestIP?.(req)?.address ?? "lan";
        const rule = rateLimitRule(req, ip);
        if (rule && !limiter.check(rule.key, rule.rule)) {
          return applySecurityHeaders(
            Response.json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, { status: 429 }),
            dev
          );
        }
        // ponytail: un solo guard CSRF para todos los writes (el login inicial se exime solo).
        if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS" && !checkCsrf(req)) {
          return applySecurityHeaders(
            Response.json({ error: { code: "FORBIDDEN", message: "CSRF check failed" } }, { status: 403 }),
            dev
          );
        }
        return applySecurityHeaders(await handler(req, server), dev);
      };
    }
  }
  return out as T;
}
