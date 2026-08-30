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
