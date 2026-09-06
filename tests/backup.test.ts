import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOperationsRoutes } from "../src/backend/routes/operations";
import { BACKUP_PATTERN, checkIntegrity, createBackup, listBackups } from "../src/backend/ops/backup";

const ORIGIN = "http://backup.test";

function makeCtx(): { db: Database; dir: string; adminToken: string; userToken: string; cleanup: () => void } {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("CREATE TABLE sessions (id_hash TEXT PRIMARY KEY, subject_type TEXT NOT NULL, subject_id INTEGER NOT NULL, csrf_token TEXT NOT NULL, expires_at TEXT NOT NULL)");
  db.exec("CREATE TABLE participants (id INTEGER PRIMARY KEY, role TEXT NOT NULL DEFAULT 'participant')");
  db.run("INSERT INTO participants (id, role) VALUES (7, 'participant')");
  db.exec("CREATE TABLE ledger (id INTEGER PRIMARY KEY, label TEXT NOT NULL)");
  db.run("INSERT INTO ledger (label) VALUES ('party-data')");
  const dir = mkdtempSync(join(tmpdir(), "partyman-backup-"));
  const sess = (type: string, id: number) => {
    const token = `tok-${type}-${id}-` + Math.random().toString(36).slice(2);
    const hash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
    db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, ?, ?, 'csrf', datetime('now', '+1 day'))", [hash, type, id]);
    return token;
  };
  const adminToken = sess("admin", 1);
  const userToken = sess("participant", 7);
  return { db, dir, adminToken, userToken, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

function req(url: string, method: string, token: string | null, csrf = true): Request {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (token) {
    headers.cookie = `partyman_session=${token}; partyman_csrf=csrf`;
    if (csrf) headers["x-partyman-csrf"] = "csrf";
  }
  return new Request(url, { method, headers });
}

describe("backups", () => {
  let ctx: ReturnType<typeof makeCtx>;
  let routes: ReturnType<typeof createOperationsRoutes>;

  beforeAll(() => {
    ctx = makeCtx();
    routes = createOperationsRoutes(ctx.db, { backupDir: ctx.dir, backupKeep: 20, publicOrigin: ORIGIN });
  });

  afterAll(() => ctx.cleanup());

  it("creates a verified backup containing the live data", async () => {
    const res = await routes["/api/admin/backups"].POST(req(`${ORIGIN}/api/admin/backups`, "POST", ctx.adminToken));
    expect(res.status).toBe(201);
    const meta = await res.json();
    expect(meta.integrity).toBe("ok");
    expect(meta.id).toBe(meta.filename);
    expect(BACKUP_PATTERN.test(meta.id)).toBe(true);
    expect(meta.sizeBytes).toBeGreaterThan(0);
    const copy = new Database(join(ctx.dir, meta.id), { readonly: true });
    expect(copy.query<{ label: string }, []>("SELECT label FROM ledger").get()?.label).toBe("party-data");
    copy.close();
  });

  it("generates unique ids and lists newest first", async () => {
    const a = await (await routes["/api/admin/backups"].POST(req(`${ORIGIN}/api/admin/backups`, "POST", ctx.adminToken))).json();
    const b = await (await routes["/api/admin/backups"].POST(req(`${ORIGIN}/api/admin/backups`, "POST", ctx.adminToken))).json();
    expect(a.id).not.toBe(b.id);
    const list = await (await routes["/api/admin/backups"].GET(req(`${ORIGIN}/api/admin/backups`, "GET", ctx.adminToken))).json();
    const ids = list.backups.map((x: any) => x.id);
    expect(ids).toEqual([...ids].sort().reverse());
  });

  it("downloads with sqlite content type and rejects traversal", async () => {
    const created = await (await routes["/api/admin/backups"].POST(req(`${ORIGIN}/api/admin/backups`, "POST", ctx.adminToken))).json();
    const dl = await routes["/api/admin/backups/:id/download"].GET(req(`${ORIGIN}/api/admin/backups/${created.id}/download`, "GET", ctx.adminToken));
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("application/vnd.sqlite3");
    expect((await dl.arrayBuffer()).byteLength).toBeGreaterThan(0);
    for (const evil of ["..", "../partyman.sqlite3", "..%2F..%2Fetc%2Fpasswd", "/data/partyman.sqlite3", "other.sqlite3"]) {
      const r = await routes["/api/admin/backups/:id/download"].GET(req(`${ORIGIN}/api/admin/backups/${evil}/download`, "GET", ctx.adminToken));
      expect(r.status).toBe(404);
    }
  });

  it("ignores foreign files in the directory", async () => {
    writeFileSync(join(ctx.dir, "notes.txt"), "hello");
    writeFileSync(join(ctx.dir, "other.sqlite3"), "junk");
    mkdirSync(join(ctx.dir, "partyman-20240101T000000Z-abc.sqlite3"));
    const list = await (await routes["/api/admin/backups"].GET(req(`${ORIGIN}/api/admin/backups`, "GET", ctx.adminToken))).json();
    expect(list.backups.every((b: any) => BACKUP_PATTERN.test(b.id))).toBe(true);
  });

  it("enforces authorization and CSRF", async () => {
    expect((await routes["/api/admin/backups"].POST(req(`${ORIGIN}/api/admin/backups`, "POST", null))).status).toBe(401);
    expect((await routes["/api/admin/backups"].POST(req(`${ORIGIN}/api/admin/backups`, "POST", ctx.userToken))).status).toBe(403);
    expect((await routes["/api/admin/backups"].GET(req(`${ORIGIN}/api/admin/backups`, "GET", null))).status).toBe(401);
    expect((await routes["/api/admin/backups"].POST(req(`${ORIGIN}/api/admin/backups`, "POST", ctx.adminToken, false))).status).toBe(403);
  });

  it("reports failures without server paths", async () => {
    const file = join(ctx.dir, "not-a-dir");
    writeFileSync(file, "x");
    const bad = createOperationsRoutes(ctx.db, { backupDir: join(file, "sub"), publicOrigin: ORIGIN });
    const res = await bad["/api/admin/backups"].POST(req(`${ORIGIN}/api/admin/backups`, "POST", ctx.adminToken));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("BACKUP_DIR_NOT_WRITABLE");
    expect(JSON.stringify(body)).not.toContain(file);
  });

  it("retains only the newest N backups", async () => {
    const dir = mkdtempSync(join(tmpdir(), "partyman-retain-"));
    try {
      const small = createOperationsRoutes(ctx.db, { backupDir: dir, backupKeep: 3, publicOrigin: ORIGIN });
      for (let i = 0; i < 5; i++) {
        await small["/api/admin/backups"].POST(req(`${ORIGIN}/api/admin/backups`, "POST", ctx.adminToken));
        await Bun.sleep(5);
      }
      expect(readdirSync(dir).filter(f => BACKUP_PATTERN.test(f)).length).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("checks integrity of real files", () => {
    expect(checkIntegrity(join(ctx.dir, listBackups(ctx.dir)[0].id))).toBe(true);
    expect(checkIntegrity(join(ctx.dir, "other.sqlite3"))).toBe(false);
  });
});
