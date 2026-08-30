import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHealthRoutes } from "../src/backend/routes/health";

function makeTempDb(): { path: string; db: Database; close: () => void } {
  const dir = tmpdir();
  const path = join(dir, `partyman-test-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite3`);
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return { path, db, close: () => db.close() };
}

const migrationsDir = join(import.meta.dir, "..", "migrations");

let dbCtx: ReturnType<typeof makeTempDb>;

beforeAll(async () => {
  dbCtx = makeTempDb();
  
  // Run migrations
  dbCtx.db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = ["001_core.sql", "002_auth_participants.sql", "003_parties_audit.sql", "010_steam_admin_role.sql"];
  for (const file of files) {
    const name = file.replace(".sql", "");
    const executed = dbCtx.db.query("SELECT id FROM migrations WHERE name = ?").get(name);
    if (!executed) {
      const sql = await Bun.file(join(migrationsDir, file)).text();
      dbCtx.db.exec(sql);
      dbCtx.db.query("INSERT INTO migrations (name) VALUES (?)").run(name);
    }
  }
});

afterAll(() => {
  dbCtx.close();
});

describe("bootstrap", () => {
  it("applies migrations idempotently", async () => {
    const applied = dbCtx.db
      .query<{ name: string }, []>("SELECT name FROM migrations ORDER BY name")
      .all()
      .map((row) => row.name);
    expect(applied).toContain("001_core");
    expect(applied).toContain("002_auth_participants");
    expect(applied).toContain("003_parties_audit");
  });

  it("serves health endpoint", async () => {
    const healthRoutes = createHealthRoutes(dbCtx.db);
    const handler = healthRoutes["/api/health"].GET;
    const res = await handler(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("serves ready endpoint", async () => {
    const healthRoutes = createHealthRoutes(dbCtx.db);
    const handler = healthRoutes["/api/ready"].GET;
    const res = await handler(new Request("http://localhost/api/ready"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, migrations: true });
  });
});
