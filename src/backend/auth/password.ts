import { Database } from "bun:sqlite";

export async function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain, { algorithm: "bcrypt", cost: 10 });
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return Bun.password.verify(plain, hash);
}

export function ensureProvisionedAdmin(db: Database, username: string | null, passwordHash: string | null): void {
  if (!username || !passwordHash) return;
  const existing = db.query<{ id: number }, []>("SELECT id FROM admin_users LIMIT 1").get();
  if (existing) return;
  db.run("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)", [username, passwordHash]);
}

// Contraseña opcional de acceso a la party (JOIN_PASSWORD): vacía = acceso libre.
export function joinPasswordRequired(): boolean {
  const raw = process.env.JOIN_PASSWORD;
  return raw !== undefined && raw !== "";
}

export function verifyJoinPassword(input: unknown): boolean {
  const expected = process.env.JOIN_PASSWORD ?? "";
  if (typeof input !== "string" || expected === "") return false;
  if (input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
