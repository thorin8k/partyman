import { createHmac, timingSafeEqual } from "node:crypto";

// Contraseña de REGISTRO (ACCESS_PASSWORD; JOIN_PASSWORD como alias heredado).
// Es una puerta para dar de alta usuarios nuevos: quien ya tiene su identidad
// Steam registrada entra con Steam sin volver a pedirla. Vacía = registro libre.
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

// Registro pendiente: identifica al usuario de Steam que aún no tiene cuenta y
// está a la espera de introducir la contraseña. Va firmado con la propia
// contraseña, así que no necesita estado en servidor ni migración.
export interface PendingRegistration {
  steamId: string;
  nickname: string;
  avatarUrl: string | null;
  exp: number;
}

const PENDING_COOKIE = "partyman_pending";

function sign(data: string): string {
  return createHmac("sha256", accessPassword()).update(data).digest("hex");
}

export function pendingCookieValue(p: PendingRegistration): string {
  const payload = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function pendingCookieHeader(p: PendingRegistration, secure: boolean): string {
  const sec = secure ? "; Secure" : "";
  return `${PENDING_COOKIE}=${pendingCookieValue(p)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600${sec}`;
}

export function clearPendingCookieHeader(secure: boolean): string {
  const sec = secure ? "; Secure" : "";
  return `${PENDING_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${sec}`;
}

export function parsePendingCookie(req: Request): PendingRegistration | null {
  const raw = parseCookie(req, PENDING_COOKIE);
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString()) as PendingRegistration;
    if (!p.steamId || typeof p.exp !== "number" || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
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
