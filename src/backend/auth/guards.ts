import { Database } from "bun:sqlite";
import { getSession, type SessionInfo } from "./sessions.ts";

export interface AuthContext {
  session: SessionInfo;
}

function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function requireSession(db: Database, req: Request): AuthContext | Response {
  const token = getCookie(req, "partyman_session");
  if (!token) return json({ error: { code: "UNAUTHENTICATED", message: "Session required" } }, 401);
  const session = getSession(db, token);
  if (!session) return json({ error: { code: "UNAUTHENTICATED", message: "Session required" } }, 401);
  return { session };
}

export function requireAdmin(db: Database, req: Request): AuthContext | Response {
  const ctx = requireSession(db, req);
  if (ctx instanceof Response) return ctx;
  if (ctx.session.subjectType === "admin") return ctx;
  if (ctx.session.subjectType === "participant") {
    const participant = db
      .query<{ role: string }, [number]>("SELECT role FROM participants WHERE id = ?")
      .get(ctx.session.subjectId);
    if (participant?.role === "admin") return ctx;
  }
  return json({ error: { code: "FORBIDDEN", message: "Admin required" } }, 403);
}

export function requireParticipant(db: Database, req: Request): AuthContext | Response {
  const ctx = requireSession(db, req);
  if (ctx instanceof Response) return ctx;
  if (ctx.session.subjectType !== "participant" && ctx.session.subjectType !== "admin") {
    return json({ error: { code: "FORBIDDEN", message: "Participant required" } }, 403);
  }
  return ctx;
}

export function checkCsrf(req: Request, allowedOrigins?: string[]): boolean {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return true;
  const url = new URL(req.url);
  if (url.pathname === "/auth/admin/login") return true;

  const header = req.headers.get("x-partyman-csrf");
  const cookie = getCookie(req, "partyman_csrf");

  if (!header || !cookie || header !== cookie) return false;

  // Tras proxy el Host o el esquema internos pueden diferir del público
  // (terminación TLS, reescritura de Host): comparar hosts, no origins.
  // allowedOrigins cubre PUBLIC_ORIGIN explícito.
  const hostOf = (value: string): string | null => {
    try { return new URL(value).host; } catch { return null; }
  };
  const reqHost = hostOf(req.url);
  const allowedHosts = new Set(
    [reqHost, ...(allowedOrigins ?? []).map(hostOf)].filter((h): h is string => h !== null)
  );

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  if (origin) {
    const h = hostOf(origin);
    return h !== null && allowedHosts.has(h);
  }
  if (referer) {
    const h = hostOf(referer);
    return h !== null && allowedHosts.has(h);
  }
  // Spec: validar Origin cuando está presente; sin Origin ni Referer (curl, fetch mismo origen)
  // el double-submit ya acredita la petición.
  return true;
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// Writes que mutan estado de jugador: solo sesiones de participante real.
// Una sesión admin_users no tiene fila en participants; su subjectId vive en
// otro namespace y aceptar sus writes crearía filas fantasma (o 403
// confusos por NOT_IN_MATCH cuando los IDs colisionan).
export function requireRealParticipant(db: Database, req: Request): AuthContext | Response {
  const ctx = requireSession(db, req);
  if (ctx instanceof Response) return ctx;
  if (ctx.session.subjectType !== "participant") {
    return json({ error: { code: "PARTICIPANT_ONLY", message: "PARTICIPANT_ONLY" } }, 403);
  }
  return ctx;
}
