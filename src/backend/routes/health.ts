import type { Database } from "bun:sqlite";

export function createHealthRoutes(db: Database) {
  return {
    "/api/health": {
      GET: (_req: Request) => Response.json({ ok: true }),
    },
    "/api/ready": {
      GET: (_req: Request) => {
        // Check if database is accessible
        try {
          db.query("SELECT 1").get();
          return Response.json({ ok: true, migrations: true });
        } catch {
          return Response.json({ ok: false, migrations: false }, { status: 503 });
        }
      },
    },
  };
}
