import { Database } from "bun:sqlite";
import { accessSync, constants, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

interface BackupMeta {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  integrity: "ok" | "corrupt";
}

export class BackupError extends Error {
  constructor(public code: string, message: string, public status = 500) {
    super(message);
  }
}

// ponytail: el id es el nombre completo; el regex impide traversal (sin slashes ni puntos).
export const BACKUP_PATTERN = /^partyman-\d{8}T\d{6}Z-[A-Za-z0-9]+\.sqlite3$/;

const VACUUM_RETRY_DELAYS_MS = [250, 500, 1000];

function ensureBackupDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
  } catch {
    throw new BackupError("BACKUP_DIR_NOT_WRITABLE", "Backup directory is not writable", 503);
  }
}

function buildBackupName(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const rand = Math.random().toString(36).slice(2, 10);
  return `partyman-${stamp}-${rand}.sqlite3`;
}

function isBackupId(id: string): boolean {
  return BACKUP_PATTERN.test(id);
}

function createdAtFromName(name: string): string {
  const m = /^partyman-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-/.exec(name);
  if (!m) return new Date().toISOString();
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

async function vacuumInto(db: Database, tmpPath: string): Promise<void> {
  rmSync(tmpPath, { force: true });
  for (let attempt = 0; ; attempt++) {
    try {
      db.exec(`VACUUM INTO ${sqlString(tmpPath)}`);
      return;
    } catch (e: any) {
      const busy = e?.code === "SQLITE_BUSY" || /busy|locked/i.test(String(e?.message ?? ""));
      const delay = VACUUM_RETRY_DELAYS_MS[attempt];
      if (!busy || delay === undefined) {
        rmSync(tmpPath, { force: true });
        throw new BackupError("BACKUP_FAILED", "Database backup failed", 503);
      }
      await Bun.sleep(delay);
    }
  }
}

export function checkIntegrity(path: string): boolean {
  let probe: Database | null = null;
  try {
    probe = new Database(path, { readonly: true });
    const row = probe.query<{ integrity_check: string }, []>("PRAGMA integrity_check").get();
    return row?.integrity_check === "ok";
  } catch {
    return false;
  } finally {
    probe?.close();
  }
}

export function listBackups(dir: string): BackupMeta[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const metas: BackupMeta[] = [];
  for (const name of entries) {
    if (!isBackupId(name)) continue;
    const full = join(dir, name);
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
      metas.push({ id: name, filename: name, sizeBytes: st.size, createdAt: createdAtFromName(name), integrity: checkIntegrity(full) ? "ok" : "corrupt" });
    } catch {
      continue;
    }
  }
  // El nombre empieza por timestamp UTC: orden lexicográfico = newest first.
  metas.sort((a, b) => (a.filename < b.filename ? 1 : -1));
  return metas;
}

function pruneBackups(dir: string, keep: number): number {
  const all = listBackups(dir);
  const extra = all.slice(Math.max(0, keep));
  for (const b of extra) {
    try { rmSync(join(dir, b.filename)); } catch { /* best effort */ }
  }
  return extra.length;
}

export function resolveBackupPath(dir: string, id: string): string {
  if (!isBackupId(id)) throw new BackupError("BACKUP_NOT_FOUND", "Backup not found", 404);
  return join(dir, id);
}

export async function createBackup(db: Database, dir: string, opts?: { now?: Date; keep?: number }): Promise<BackupMeta> {
  ensureBackupDir(dir);
  const keep = opts?.keep ?? 20;
  const tmpPath = join(dir, `.tmp-${Math.random().toString(36).slice(2, 10)}.sqlite3`);
  await vacuumInto(db, tmpPath);
  if (!checkIntegrity(tmpPath)) {
    rmSync(tmpPath, { force: true });
    throw new BackupError("BACKUP_CORRUPT", "Backup integrity check failed", 503);
  }
  const name = buildBackupName(opts?.now);
  const finalPath = join(dir, name);
  try {
    renameSync(tmpPath, finalPath);
  } catch {
    rmSync(tmpPath, { force: true });
    throw new BackupError("BACKUP_FAILED", "Database backup failed", 503);
  }
  // Solo se podan backups propios con el naming scheme, nunca la DB activa.
  pruneBackups(dir, keep);
  const sizeBytes = statSync(finalPath).size;
  console.log("[ops] POST /api/admin/backups → " + name);
  return { id: name, filename: name, sizeBytes, createdAt: createdAtFromName(name), integrity: "ok" };
}
