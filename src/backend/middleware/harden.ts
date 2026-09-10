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
        // Spec: los bodies JSON exigen Content-Type application/json; JSON roto → 400 INVALID_JSON.
        // Solo cuando hay body real (los POST sin body del admin no llevan Content-Type;
        // el header content-length puede mentir, req.body no).
        const hasBody = req.body != null || req.headers.get("transfer-encoding") != null;
        if (hasBody) {
          const ct = req.headers.get("content-type") ?? "";
          if (!ct.includes("application/json")) {
            return applySecurityHeaders(
              Response.json({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Content-Type must be application/json" } }, { status: 415 }),
              dev
            );
          }
          const valid = await req.clone().json().then(() => true).catch(() => false);
          if (!valid) {
            return applySecurityHeaders(
              Response.json({ error: { code: "INVALID_JSON", message: "Malformed JSON body" } }, { status: 400 }),
              dev
            );
          }
        }
        // ponytail: un solo guard CSRF para todos los writes (el login inicial se exime solo).
        if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS" && !checkCsrf(req)) {
          return applySecurityHeaders(
            Response.json({ error: { code: "FORBIDDEN", message: "CSRF check failed" } }, { status: 403 }),
            dev
          );
        }
        return applySecurityHeaders(await shapeError(await handler(req, server)), dev);
      };
    }
  }
  return out as T;
}

// Spec: los writes devuelven { error: { code, message } }.
// Red de seguridad: si algún handler devuelve el antiguo { error: <string> }, se normaliza aquí.
// Además: JSON válido con campos inválidos es 422 (no 400) según HTTP conventions.
async function shapeError(res: Response): Promise<Response> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return res;
  let data: Record<string, any>;
  try {
    data = await res.clone().json();
  } catch {
    return res;
  }
  if (!data || typeof data !== "object") return res;
  let payload: Record<string, any> = data;
  if (typeof data.error === "string") {
    const { error: code, message, ...rest } = data;
    payload = { error: { code, message: typeof message === "string" ? message : code }, ...rest };
  }
  const status = payload.error?.code === "VALIDATION_ERROR" && res.status === 400 ? 422 : res.status;
  if (payload === data && status === res.status) return res;
  return new Response(JSON.stringify(payload), { status, headers: res.headers });
}
