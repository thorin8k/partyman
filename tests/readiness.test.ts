import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHealthRoutes } from "../src/backend/routes/health";

function memDb(withMigrations: boolean): Database {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)");
  if (withMigrations) db.run("INSERT INTO migrations (name) VALUES ('001_core')");
  return db;
}

describe("readiness", () => {
  it("is ready with migrations applied", async () => {
    const db = memDb(true);
    try {
      const res = await createHealthRoutes(db)["/api/ready"].GET(new Request("http://localhost/api/ready"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, migrations: true });
    } finally {
      db.close();
    }
  });

  it("is not ready without migrations", async () => {
    const db = memDb(false);
    try {
      const res = await createHealthRoutes(db)["/api/ready"].GET(new Request("http://localhost/api/ready"));
      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe("NOT_READY");
    } finally {
      db.close();
    }
  });

  it("is not ready when a required dir is not writable", async () => {
    const db = memDb(true);
    const file = join(mkdtempSync(join(tmpdir(), "partyman-ready-")), "file");
    writeFileSync(file, "x");
    try {
      const res = await createHealthRoutes(db, { dirs: [join(file, "sub")] })["/api/ready"].GET(new Request("http://localhost/api/ready"));
      expect(res.status).toBe(503);
    } finally {
      db.close();
    }
  });

  it("health stays liveness-only", async () => {
    const db = memDb(false);
    try {
      const res = await createHealthRoutes(db)["/api/health"].GET(new Request("http://localhost/api/health"));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      db.close();
    }
  });
});
