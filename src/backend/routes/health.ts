import type { Database } from "bun:sqlite";

export function createHealthRoutes(db: Database) {
  return {
    "/api/health": {
      GET: (_req: Request) => {
        console.log("[health] GET /api/health");
        return Response.json({ ok: true });
      },
    },
    "/api/ready": {
      GET: (_req: Request) => {
        // Check if database is accessible
        try {
          db.query("SELECT 1").get();
          console.log("[health] GET /api/ready → ok");
          return Response.json({ ok: true, migrations: true });
        } catch {
          console.log("[health] GET /api/ready → NOT READY");
          return Response.json({ ok: false, migrations: false }, { status: 503 });
        }
      },
    },
  };
}
