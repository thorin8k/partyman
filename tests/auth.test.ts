import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "../src/backend/auth/password";
import { setSteamVerifier } from "../src/backend/auth/steam";
import { createAuthRoutes } from "../src/backend/routes/auth";

function makeTempDb(): { path: string; db: Database; close: () => void } {
  const dir = tmpdir();
  const path = join(dir, `partyman-auth-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite3`);
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return { path, db, close: () => db.close() };
}

const migrationsDir = join(import.meta.dir, "..", "migrations");

let dbCtx: ReturnType<typeof makeTempDb>;
let authRoutes: ReturnType<typeof createAuthRoutes>;

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

  // Create active party for tests
  dbCtx.db.run(
    "INSERT INTO parties (name, starts_at, ends_at, status) VALUES ('Active Party', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'active')"
  );

  // Create auth routes
  authRoutes = createAuthRoutes(dbCtx.db);
});

afterAll(() => {
  dbCtx.close();
});

let stateCounter = 0;
function setupSteamCallback(steamId: string): string {
  const state = "test-state-" + (++stateCounter);
  const stateHash = new Bun.CryptoHasher("sha256").update(state).digest("hex");
  dbCtx.db.run(
    "INSERT INTO steam_login_states (state_hash, return_to, expires_at) VALUES (?, ?, ?)",
    [stateHash, "/", new Date(Date.now() + 600000).toISOString()]
  );
  return `http://localhost:8400/auth/steam/callback?openid.mode=id_res&openid.state=${state}&openid.return_to=/&openid.claimed_id=https://steamcommunity.com/openid/id/${steamId}&openid.identity=https://steamcommunity.com/openid/id/${steamId}`;
}

describe("authentication and attendance", () => {
  it("creates a participant and active-party membership via Steam callback", async () => {
    setSteamVerifier(async (params: URLSearchParams) => {
      const claimed = params.get("openid.claimed_id")!;
      return { steamId: claimed.match(/\/(\d+)$/)![1] };
    });

    const callbackUrl = setupSteamCallback("76561190000000001");
    const res = await authRoutes["/auth/steam/callback"].GET(new Request(callbackUrl));
    expect(res.status).toBe(302);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("partyman_session=");

    const sessionCookie = setCookie.split(";")[0];
    const meRes = await authRoutes["/api/me"].GET(
      new Request("http://localhost:8400/api/me", { headers: { cookie: sessionCookie } })
    );
    expect(meRes.status).toBe(200);
    const body = await meRes.json();
    expect(body.user.role).toBe("participant");
    expect(body.user.displayName).toContain("Participant #0001");

    const members = dbCtx.db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM party_memberships").get()!;
    expect(members.count).toBe(1);
  });

  it("is idempotent for repeated Steam logins", async () => {    setSteamVerifier(async (params: URLSearchParams) => ({
      steamId: params.get("openid.claimed_id")!.match(/\/(\d+)$/)![1],
    }));
    
    await authRoutes["/auth/steam/callback"].GET(new Request(setupSteamCallback("76561190000000002")));
    await authRoutes["/auth/steam/callback"].GET(new Request(setupSteamCallback("76561190000000002")));
    
    const participants = dbCtx.db
      .query<{ count: number }, [string]>("SELECT COUNT(*) AS count FROM participants WHERE steam_id = ?")
      .get("76561190000000002")!;
    expect(participants.count).toBe(1);
  });

  it("rejects Steam entry when STEAM_ENABLED=false", async () => {
    process.env.STEAM_ENABLED = "false";
    try {
      const routes = createAuthRoutes(dbCtx.db);
      const res = await routes["/auth/steam"].GET(
        new Request("http://localhost:8400/auth/steam?returnTo=/")
      );
      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe("STEAM_DISABLED");
    } finally {
      delete process.env.STEAM_ENABLED;
    }
  });
  it("stores returnTo in a short-lived cookie on login entry", async () => {
    const res = await authRoutes["/auth/steam"].GET(
      new Request("http://localhost:8400/auth/steam?returnTo=/tournaments/3")
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie") ?? "").toContain("partyman_return_to=%2Ftournaments%2F3");
  });

  it("redirects to the returnTo cookie and rejects open redirects", async () => {
    setSteamVerifier(async (params: URLSearchParams) => ({
      steamId: params.get("openid.claimed_id")!.match(/\/(\d+)$/)![1],
    }));
    const ok = await authRoutes["/auth/steam/callback"].GET(
      new Request(setupSteamCallback("76561190000000003"), {
        headers: { cookie: "partyman_return_to=%2Ftournaments%2F3" },
      })
    );
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe("/tournaments/3");

    const evil = await authRoutes["/auth/steam/callback"].GET(
      new Request(setupSteamCallback("76561190000000004"), {
        headers: { cookie: "partyman_return_to=https%3A%2F%2Fevil.example" },
      })
    );
    expect(evil.headers.get("location")).toBe("/");
  });

  it("rejects admin login with bad credentials", async () => {
    const res = await authRoutes["/auth/admin/login"].POST(
      new Request("http://localhost:8400/auth/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:8400" },
        body: JSON.stringify({ username: "admin", password: "wrong" }),
      })
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "AUTH_INVALID_CREDENTIALS", message: "Invalid credentials" } });
  });

  it("authenticates an admin and exposes CSRF protection", async () => {
    const hash = await hashPassword("s3cret");
    dbCtx.db.run("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)", ["admin", hash]);

    const login = await authRoutes["/auth/admin/login"].POST(
      new Request("http://localhost:8400/auth/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:8400" },
        body: JSON.stringify({ username: "admin", password: "s3cret" }),
      })
    );
    expect(login.status).toBe(200);
    const setCookie = login.headers.get("set-cookie") ?? "";
    const sessionCookie = setCookie.split(";")[0];
    const csrf = setCookie.match(/partyman_csrf=([^;]+)/)![1];

    const me = await authRoutes["/api/me"].GET(
      new Request("http://localhost:8400/api/me", { headers: { cookie: sessionCookie } })
    );
    expect((await me.json()).user.role).toBe("admin");

    const badLogout = await authRoutes["/auth/logout"].POST(
      new Request("http://localhost:8400/auth/logout", { method: "POST", headers: { cookie: sessionCookie } })
    );
    expect(badLogout.status).toBe(403);

    const goodLogout = await authRoutes["/auth/logout"].POST(
      new Request("http://localhost:8400/auth/logout", {
        method: "POST",
        headers: { cookie: `${sessionCookie}; partyman_csrf=${csrf}`, "x-partyman-csrf": csrf, origin: "http://localhost:8400" },
      })
    );
    expect(goodLogout.status).toBe(200);
  });

  it("exposes auth configuration without leaking secrets", async () => {
    const res = await authRoutes["/api/auth/config"].GET(new Request("http://localhost:8400/api/auth/config"));
    expect(await res.json()).toEqual({ steamEnabled: true, devTools: true });
  });
});
