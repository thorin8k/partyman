import type { Database } from "bun:sqlite";
import { accessSync, constants } from "node:fs";

interface HealthOptions {
  // Directorios que deben existir y ser escribibles para estar ready.
  // Vacío por defecto: solo DB + migraciones (comportamiento histórico).
  dirs?: string[];
}

export function createHealthRoutes(db: Database, opts?: HealthOptions) {
  const dirs = opts?.dirs ?? [];
  return {
    "/api/health": {
      GET: (_req: Request) => {
        console.log("[health] GET /api/health");
        return Response.json({ ok: true });
      },
    },
    "/api/ready": {
      GET: (_req: Request) => {
        const problem = checkReady();
        if (problem) {
          console.log("[health] GET /api/ready → NOT READY (" + problem + ")");
          return Response.json({ error: { code: "NOT_READY", message: "Service not ready" } }, { status: 503 });
        }
        console.log("[health] GET /api/ready → ok");
        return Response.json({ ok: true, migrations: true });
      },
    },
  };

  function checkReady(): string | null {
    try {
      db.query("SELECT 1").get();
    } catch {
      return "database";
    }
    try {
      const row = db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM migrations").get();
      if (!row || row.n === 0) return "migrations";
    } catch {
      return "migrations";
    }
    for (const dir of dirs) {
      try {
        accessSync(dir, constants.W_OK);
      } catch {
        return "writable-dir";
      }
    }
    return null;
  }
}
