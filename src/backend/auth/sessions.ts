import { randomBytes } from "node:crypto";
import { Database } from "bun:sqlite";

export type SubjectType = "admin" | "participant";

export interface SessionInfo {
  subjectType: SubjectType;
  subjectId: number;
  csrfToken: string;
  token: string;
}

export function sha256Hex(input: string): string {
  return new Bun.CryptoHasher("sha256").update(input).digest("hex");
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function createSession(db: Database, subjectType: SubjectType, subjectId: number): SessionInfo {
  const token = newToken();
  const csrfToken = newToken(16);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  db.run(
    "INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, ?, ?, ?, ?)",
    [sha256Hex(token), subjectType, subjectId, csrfToken, expiresAt],
  );
  return { subjectType, subjectId, csrfToken, token };
}

export function getSession(db: Database, token: string): SessionInfo | null {
  const row = db
    .query<{ subject_type: string; subject_id: number; csrf_token: string; expires_at: string }, [string]>(
      "SELECT subject_type, subject_id, csrf_token, expires_at FROM sessions WHERE id_hash = ?",
    )
    .get(sha256Hex(token));
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.run("DELETE FROM sessions WHERE id_hash = ?", [sha256Hex(token)]);
    return null;
  }
  return {
    subjectType: row.subject_type as SubjectType,
    subjectId: row.subject_id,
    csrfToken: row.csrf_token,
    token: "",
  };
}

export function deleteSession(db: Database, token: string): void {
  db.run("DELETE FROM sessions WHERE id_hash = ?", [sha256Hex(token)]);
}
