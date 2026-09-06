import type { Database } from "bun:sqlite";
import { statSync } from "node:fs";
import { requireAdmin } from "../auth/guards";
import { checkCsrf } from "../auth/guards";
import { BackupError, createBackup, listBackups, resolveBackupPath } from "../ops/backup";

export interface OperationsOptions {
  backupDir?: string;
  backupKeep?: number;
  publicOrigin?: string;
}

export function createOperationsRoutes(db: Database, opts?: OperationsOptions) {
  const backupDir = opts?.backupDir ?? process.env.BACKUP_DIR ?? "/data/backups";
  const backupKeep = opts?.backupKeep ?? Number.parseInt(process.env.BACKUP_KEEP ?? "20", 10);
  const publicOrigin = opts?.publicOrigin ?? process.env.PUBLIC_ORIGIN;

  return {
    "/api/admin/backups": { GET: handleListBackups, POST: handleCreateBackup },
    "/api/admin/backups/:id/download": { GET: handleDownloadBackup },
  };

  async function handleCreateBackup(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    if (!checkCsrf(request, publicOrigin ? [publicOrigin] : [])) {
      return Response.json({ error: { code: "FORBIDDEN", message: "CSRF check failed" } }, { status: 403 });
    }
    try {
      const meta = await createBackup(db, backupDir, { keep: backupKeep });
      return Response.json(meta, { status: 201 });
    } catch (e) {
      return backupError(e);
    }
  }

  async function handleListBackups(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    try {
      return Response.json({ backups: listBackups(backupDir) });
    } catch (e) {
      return backupError(e);
    }
  }

  async function handleDownloadBackup(request: Request): Promise<Response> {
    const auth = requireAdmin(db, request);
    if (auth instanceof Response) return auth;
    const id = new URL(request.url).pathname.split("/").at(-2) ?? "";
    let path: string;
    try {
      path = resolveBackupPath(backupDir, id);
      statSync(path);
    } catch {
      return Response.json({ error: { code: "BACKUP_NOT_FOUND", message: "Backup not found" } }, { status: 404 });
    }
    console.log("[ops] GET /api/admin/backups/" + id + "/download");
    return new Response(Bun.file(path), {
      headers: {
        "content-type": "application/vnd.sqlite3",
        "content-disposition": `attachment; filename="${id}"`,
        "cache-control": "no-store",
      },
    });
  }

  function backupError(e: unknown): Response {
    // Nunca exponer paths, errores SQLite ni stack traces.
    if (e instanceof BackupError) {
      return Response.json({ error: { code: e.code, message: "Backup operation failed" } }, { status: e.status });
    }
    return Response.json({ error: { code: "BACKUP_FAILED", message: "Backup operation failed" } }, { status: 503 });
  }
}
