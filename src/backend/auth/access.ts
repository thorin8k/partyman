import type { Database } from "bun:sqlite";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSession } from "./sessions";

// Contraseña de acceso a la app (ACCESS_PASSWORD; JOIN_PASSWORD se acepta como
// alias heredado). Vacía = acceso libre. No es la contraseña de unión a la
// party: el join es automático al iniciar sesión con Steam.
export function accessPassword(): string {
  return process.env.ACCESS_PASSWORD ?? process.env.JOIN_PASSWORD ?? "";
}

export function accessPasswordRequired(): boolean {
  return accessPassword() !== "";
}

export function verifyAccessPassword(input: unknown): boolean {
  const expected = accessPassword();
  if (typeof input !== "string" || expected === "") return false;
  if (input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const ACCESS_COOKIE = "partyman_access";
const ACCESS_MSG = "partyman-access-v1";

// Cookie derivada de la propia contraseña: estable entre reinicios, se invalida
// al cambiarla. Saber la contraseña es, literalmente, el derecho de acceso.
export function accessCookieValue(): string {
  return createHmac("sha256", accessPassword()).update(ACCESS_MSG).digest("hex");
}

export function isAccessGranted(req: Request): boolean {
  if (!accessPasswordRequired()) return true;
  const cookie = parseCookie(req, ACCESS_COOKIE);
  if (!cookie) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(accessCookieValue());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function accessCookieHeader(secure: boolean): string {
  const sec = secure ? "; Secure" : "";
  const maxAge = 60 * 60 * 24 * 30; // 30 días
  return `${ACCESS_COOKIE}=${accessCookieValue()}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${sec}`;
}

// Un request pasa la puerta si: no hay contraseña, va a una ruta exenta, trae
// la cookie de acceso, o ya tiene sesión (participante/admin autenticados).
export function createAccessGate(db: Database) {
  return (req: Request): boolean => {
    if (!accessPasswordRequired()) return true;
    const path = new URL(req.url).pathname;
    if (
      path === "/api/health" ||
      path === "/api/ready" ||
      path === "/api/auth/config" ||
      path === "/api/access" ||
      path === "/auth/admin/login"
    ) return true;
    if (isAccessGranted(req)) return true;
    const token = parseCookie(req, "partyman_session");
    if (token && getSession(db, token)) return true;
    return false;
  };
}

export function parseCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
