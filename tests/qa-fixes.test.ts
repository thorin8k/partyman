import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { seedPointRules, getLeaderboard } from "../src/backend/scoring/service";
import { createTournamentRoutes } from "../src/backend/routes/tournaments";
import { createActivityTournamentProposalRoutes } from "../src/backend/routes/activity-tournament-proposals";
import { createScoringRoutes } from "../src/backend/routes/scoring";
import { createPartyRoutes } from "../src/backend/routes/parties";
import { createAuthRoutes } from "../src/backend/routes/auth";
import { hardenRoutes } from "../src/backend/middleware/harden";
import { rateLimitRule } from "../src/backend/middleware/rate-limit";

const migrationsDir = join(import.meta.dir, "..", "migrations");

async function fullSchema(db: Database) {
  db.exec("CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)");
  const files = ["001_core.sql", "002_auth_participants.sql", "003_parties_audit.sql", "004_public_views.sql", "005_games_planning.sql", "006_tournaments.sql", "007_history_rewards.sql", "008_operations.sql", "010_steam_admin_role.sql", "011_activity_tournament_proposals.sql", "014_autonomous.sql"];
  for (const file of files) db.exec(await Bun.file(join(migrationsDir, file)).text());
}

function session(db: Database, type: string, id: number): string {
  const token = `qa-${type}-${id}-` + Math.random().toString(36).slice(2);
  const hash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, ?, ?, 'csrf', datetime('now', '+1 day'))", [hash, type, id]);
  return token;
}

const cookie = (t: string) => ({ cookie: `partyman_session=${t}` });
const post = (t: string, body?: unknown) => ({
  method: "POST",
  headers: { ...cookie(t), "content-type": "application/json" },
  body: JSON.stringify(body ?? {}),
});

describe("qa fixes", () => {
  let db: Database;
  let adminToken: string;
  let activePartyId: number;
  let plannedPartyId: number;
  let finishedPartyId: number;
  let gameId: number;

  beforeAll(async () => {
    db = new Database(":memory:");
    await fullSchema(db);
    seedPointRules(db);
    db.run("INSERT INTO admin_users (username, password_hash) VALUES ('admin', 'hash')");
    adminToken = session(db, "admin", 1);
    activePartyId = Number(db.run("INSERT INTO parties (name, starts_at, ends_at, status) VALUES ('Activa', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'active')").lastInsertRowid);
    plannedPartyId = Number(db.run("INSERT INTO parties (name, starts_at, ends_at, status) VALUES ('Plan', '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z', 'planned')").lastInsertRowid);
    finishedPartyId = Number(db.run("INSERT INTO parties (name, starts_at, ends_at, status) VALUES ('Vieja', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'finished')").lastInsertRowid);
    gameId = Number(db.run("INSERT INTO games (title, enabled) VALUES ('Quake', 1)").lastInsertRowid);
  });

  afterAll(() => db.close());

  it("rejects creating a tournament for a finished party", async () => {
    const routes = createTournamentRoutes(db);
    const res = await routes["/api/admin/tournaments"].POST(
      new Request("http://localhost/api/admin/tournaments", post(adminToken, { partyId: finishedPartyId, gameId, name: "Late" }))
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("PARTY_NOT_EDITABLE");
  });

  it("rejects joining a tournament that is not in the active party", async () => {
    const routes = createTournamentRoutes(db);
    const created = await routes["/api/admin/tournaments"].POST(
      new Request("http://localhost/api/admin/tournaments", post(adminToken, { partyId: plannedPartyId, gameId, name: "Futuro", maxParticipants: 4 }))
    );
    const tourId = (await created.json()).tournament.id;
    const pid = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES ('s-join', 'J')").lastInsertRowid);
    const tok = session(db, "participant", pid);
    const res = await routes["/api/tournaments/:id/join"].POST(
      new Request(`http://localhost/api/tournaments/${tourId}/join`, post(tok))
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("NOT_ACTIVE_PARTY");
  });

  it("validates activity proposal dates and capacity", async () => {
    const routes = createActivityTournamentProposalRoutes(db);
    const pid = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES ('s-prop', 'P')").lastInsertRowid);
    db.run("INSERT INTO party_memberships (party_id, participant_id, display_name_snapshot) VALUES (?, ?, 'P')", [activePartyId, pid]);
    const tok = session(db, "participant", pid);
    const make = (body: unknown) => routes["/api/activity-proposals"].POST(new Request("http://localhost/api/activity-proposals", post(tok, body)));

    expect((await make({ title: "Mal", startsAt: "2026-01-01T12:00:00Z", endsAt: "2026-01-01T10:00:00Z" })).status).toBe(422);
    expect((await make({ title: "Mal", startsAt: "nope", endsAt: "nope" })).status).toBe(422);
    expect((await make({ title: "Mal", startsAt: "2026-01-01T10:00:00Z", endsAt: "2026-01-01T12:00:00Z", capacity: 0 })).status).toBe(422);
    const ok = await make({ title: "Bien", startsAt: "2026-01-01T10:00:00Z", endsAt: "2026-01-01T12:00:00Z" });
    expect(ok.status).toBe(201);
  });

  it("validates tournament proposal maxParticipants (2-16)", async () => {
    const routes = createActivityTournamentProposalRoutes(db);
    const pid = db.query<{ id: number }, [string]>("SELECT id FROM participants WHERE steam_id = ?").get("s-prop")!.id;
    const tok = session(db, "participant", pid);
    const make = (maxParticipants: number) => routes["/api/tournament-proposals"].POST(
      new Request("http://localhost/api/tournament-proposals", post(tok, { gameName: "Mario Kart", name: "Copa", maxParticipants }))
    );
    expect((await make(999)).status).toBe(422);
    expect((await make(1)).status).toBe(422);
    expect((await make(4)).status).toBe(201);
  });

  it("does not count corrected wins in the leaderboard", () => {
    const pid = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES ('s-win', 'W')").lastInsertRowid);
    const winId = Number(db.run("INSERT INTO point_ledger (participant_id, party_id, source_type, source_key, reason, points) VALUES (?, ?, 'tournament', '9', 'tournament_win', 10)", [pid, finishedPartyId]).lastInsertRowid);
    expect(getLeaderboard(db, finishedPartyId).find(b => b.participantId === pid)?.wins).toBe(1);
    db.run("INSERT INTO point_ledger (participant_id, party_id, source_type, source_key, reason, points, correction_of) VALUES (?, ?, 'tournament', '9', 'anulación', -10, ?)", [pid, finishedPartyId, winId]);
    const row = getLeaderboard(db, finishedPartyId).find(b => b.participantId === pid)!;
    expect(row.wins).toBe(0);
    expect(row.points).toBe(0);
  });

  it("returns 404 for history of a missing participant", async () => {
    const routes = createScoringRoutes(db);
    const res = await routes["/api/participants/:id/history"].GET(
      new Request("http://localhost/api/participants/99999/history", { headers: cookie(adminToken) })
    );
    expect(res.status).toBe(404);
  });

  it("normalizes VALIDATION_ERROR 400 responses to 422", async () => {
    const routes = hardenRoutes({ "/api/test/validation": { GET: () => Response.json({ error: { code: "VALIDATION_ERROR", message: "VALIDATION_ERROR" } }, { status: 400 }) } } as any);
    const res = await routes["/api/test/validation"].GET(new Request("http://localhost/api/test/validation"));
    expect(res.status).toBe(422);
  });

  it("completes tournaments for 2,4,5,6,7,8 players by mutual agreement", async () => {
    const routes = createTournamentRoutes(db);
    const pool: Array<{ pid: number; token: string }> = [];
    for (let i = 1; i <= 8; i++) {
      const pid = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES (?, ?)", [`s-sweep-${i}`, `S${i}`]).lastInsertRowid);
      pool.push({ pid, token: session(db, "participant", pid) });
    }
    const tokOf = (pid: number) => pool.find(p => p.pid === pid)!.token;
    const detail = async (tourId: number) =>
      (await (await routes["/api/tournaments/:id"].GET(
        new Request(`http://localhost/api/tournaments/${tourId}`, { headers: cookie(pool[0].token) })
      )).json()).tournament;

    for (const n of [2, 4, 5, 6, 7, 8]) {
      const created = await routes["/api/admin/tournaments"].POST(
        new Request("http://localhost/api/admin/tournaments", post(adminToken, { partyId: activePartyId, gameId, name: `Sweep${n}`, maxParticipants: n }))
      );
      expect(created.status).toBe(201);
      const tourId = (await created.json()).tournament.id;
      for (const p of pool.slice(0, n)) {
        await routes["/api/tournaments/:id/join"].POST(new Request(`http://localhost/api/tournaments/${tourId}/join`, post(p.token)));
      }
      let done = false;
      for (let i = 0; i < 20 && !done; i++) {
        const t = await detail(tourId);
        if (t.status === "finished") { done = true; break; }
        const m = t.matches.find((x: any) => x.status !== "confirmed" && x.participantAId && x.participantBId);
        if (!m) throw new Error(`Sweep${n}: bracket bloqueado sin partidos jugables`);
        for (const pid of [m.participantAId, m.participantBId]) {
          await routes["/api/matches/:id/report"].POST(
            new Request(`http://localhost/api/matches/${m.id}/report`, post(tokOf(pid), { winnerId: m.participantAId, score: { a: 5, b: 2 } }))
          );
        }
      }
      expect(done).toBe(true);
      expect(db.query<{ status: string }, [number]>("SELECT status FROM tournaments WHERE id = ?").get(tourId)?.status).toBe("finished");
    }
  });

  it("keys login rate limit by X-Forwarded-For when present", () => {
    const req = (xff?: string) => new Request("http://localhost/auth/admin/login", { method: "POST", headers: xff ? { "x-forwarded-for": xff } : {} });
    expect(rateLimitRule(req("1.2.3.4"), "proxy-ip")?.key).toBe("login:1.2.3.4");
    expect(rateLimitRule(req("9.9.9.9, 1.2.3.4"), "proxy-ip")?.key).toBe("login:9.9.9.9");
    expect(rateLimitRule(req(), "proxy-ip")?.key).toBe("login:proxy-ip");
  });

  it("advances bye winners so 3-player tournaments can finish", async () => {
    const routes = createTournamentRoutes(db);
    const mk = (steam: string) => {
      const pid = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES (?, ?)", [steam, steam]).lastInsertRowid);
      return { pid, token: session(db, "participant", pid) };
    };
    const players = [mk("s-b1"), mk("s-b2"), mk("s-b3")];
    const created = await routes["/api/admin/tournaments"].POST(
      new Request("http://localhost/api/admin/tournaments", post(adminToken, { partyId: activePartyId, gameId, name: "TriCup", maxParticipants: 3 }))
    );
    const tourId = (await created.json()).tournament.id;
    for (const p of players) {
      await routes["/api/tournaments/:id/join"].POST(new Request(`http://localhost/api/tournaments/${tourId}/join`, post(p.token)));
    }
    expect(db.query<{ status: string }, [number]>("SELECT status FROM tournaments WHERE id = ?").get(tourId)?.status).toBe("in_progress");

    // El ganador del bye ya está colocado en la final al arrancar.
    const byeWinner = db.query<{ winner_id: number }, [number]>(
      "SELECT winner_id FROM matches WHERE tournament_id = ? AND round = 1 AND status = 'confirmed'"
    ).get(tourId)!.winner_id;
    const final = db.query<{ participant_a_id: number | null; participant_b_id: number | null }, [number]>(
      "SELECT participant_a_id, participant_b_id FROM matches WHERE tournament_id = ? AND round = 2"
    ).get(tourId)!;
    expect([final.participant_a_id, final.participant_b_id]).toContain(byeWinner);

    // Semifinal real por acuerdo mutuo → la final queda jugable → finished.
    const semi = db.query<{ id: number; participant_a_id: number; participant_b_id: number }, [number]>(
      "SELECT id, participant_a_id, participant_b_id FROM matches WHERE tournament_id = ? AND round = 1 AND status = 'pending'"
    ).get(tourId)!;
    const tokOf = (pid: number) => players.find(p => p.pid === pid)!.token;
    for (const pid of [semi.participant_a_id, semi.participant_b_id]) {
      await routes["/api/matches/:id/report"].POST(
        new Request(`http://localhost/api/matches/${semi.id}/report`, post(tokOf(pid), { winnerId: semi.participant_a_id, score: { a: 5, b: 2 } }))
      );
    }
    const live = db.query<{ id: number; participant_a_id: number; participant_b_id: number }, [number]>(
      "SELECT id, participant_a_id, participant_b_id FROM matches WHERE tournament_id = ? AND round = 2"
    ).get(tourId)!;
    expect(live.participant_a_id).not.toBeNull();
    expect(live.participant_b_id).not.toBeNull();
    for (const pid of [live.participant_a_id, live.participant_b_id]) {
      await routes["/api/matches/:id/report"].POST(
        new Request(`http://localhost/api/matches/${live.id}/report`, post(tokOf(pid), { winnerId: live.participant_a_id, score: { a: 5, b: 1 } }))
      );
    }
    expect(db.query<{ status: string }, [number]>("SELECT status FROM tournaments WHERE id = ?").get(tourId)?.status).toBe("finished");
  });

  it("blocks admin_users sessions from player writes (no phantom rows)", async () => {
    const routes = createTournamentRoutes(db);
    const mk = (steam: string) => {
      const pid = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES (?, ?)", [steam, steam]).lastInsertRowid);
      return { pid, token: session(db, "participant", pid) };
    };
    const a = mk("s-ma");
    const b = mk("s-mb");
    const c = mk("s-mc");
    const d = mk("s-md");

    const created = await routes["/api/admin/tournaments"].POST(
      new Request("http://localhost/api/admin/tournaments", post(adminToken, { partyId: activePartyId, gameId, name: "AdminBlock", maxParticipants: 4 }))
    );
    const tourId = (await created.json()).tournament.id;
    for (const p of [a, b, c, d]) {
      await routes["/api/tournaments/:id/join"].POST(new Request(`http://localhost/api/tournaments/${tourId}/join`, post(p.token)));
    }
    expect(db.query<{ status: string }, [number]>("SELECT status FROM tournaments WHERE id = ?").get(tourId)?.status).toBe("in_progress");
    const semis = db.query<{ id: number; participant_a_id: number; participant_b_id: number }, [number]>(
      "SELECT id, participant_a_id, participant_b_id FROM matches WHERE tournament_id = ? AND round = 1 ORDER BY position"
    ).all(tourId);
    expect(semis.length).toBe(2);

    // El bug reportado: la sesión admin asigna el ganador directamente
    // (confirma al instante) sin escribir filas fantasma en match_reports.
    const m1 = semis[0];
    const direct = await routes["/api/matches/:id/report"].POST(
      new Request(`http://localhost/api/matches/${m1.id}/report`, post(adminToken, { winnerId: m1.participant_b_id, score: { a: 2, b: 5 } }))
    );
    expect(direct.status).toBe(200);
    expect((await direct.json()).status).toBe("confirmed");
    expect(db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM match_reports WHERE match_id = ?").get(m1.id)?.n ?? 0).toBe(0);
    expect(db.query<{ winner_id: number }, [number]>("SELECT winner_id FROM matches WHERE id = ?").get(m1.id)?.winner_id).toBe(m1.participant_b_id);

    // Sin regresión: dos jugadores reales acuerdan su semifinal por el flujo normal.
    const m2 = semis[1];
    const tokOf = (pid: number) => [a, b, c, d].find(p => p.pid === pid)!.token;
    for (const pid of [m2.participant_a_id, m2.participant_b_id]) {
      await routes["/api/matches/:id/report"].POST(
        new Request(`http://localhost/api/matches/${m2.id}/report`, post(tokOf(pid), { winnerId: m2.participant_a_id, score: { a: 5, b: 3 } }))
      );
    }
    expect(db.query<{ status: string }, [number]>("SELECT status FROM matches WHERE id = ?").get(m2.id)?.status).toBe("confirmed");

    // Unirse como admin_users sigue bloqueado y no crea fila fantasma.
    const created2 = await routes["/api/admin/tournaments"].POST(
      new Request("http://localhost/api/admin/tournaments", post(adminToken, { partyId: activePartyId, gameId, name: "AdminBlock2", maxParticipants: 4 }))
    );
    const tour2 = (await created2.json()).tournament.id;
    const joinBlocked = await routes["/api/tournaments/:id/join"].POST(
      new Request(`http://localhost/api/tournaments/${tour2}/join`, post(adminToken))
    );
    expect(joinBlocked.status).toBe(403);
    expect(db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM tournament_participants WHERE tournament_id = ?").get(tour2)?.n).toBe(0);
  });

  it("changes the admin password (rotatable) and audits role/award writes", async () => {
    const authRoutes = createAuthRoutes(db);
    db.run("UPDATE admin_users SET password_hash = ?", [await Bun.password.hash("oldpass1", { algorithm: "bcrypt", cost: 4 })]);
    const pwReq = (t: string, body: unknown, csrf = true) => new Request("http://localhost/api/admin/password", {
      method: "POST",
      headers: csrf
        ? { ...cookie(t), "content-type": "application/json", "x-partyman-csrf": "csrf", cookie: `partyman_session=${t}; partyman_csrf=csrf` }
        : post(t, body).headers,
      body: JSON.stringify(body),
    });

    const wrong = await authRoutes["/api/admin/password"].POST(pwReq(adminToken, { currentPassword: "nope", newPassword: "newpass12" }));
    expect(wrong.status).toBe(401);
    const short = await authRoutes["/api/admin/password"].POST(pwReq(adminToken, { currentPassword: "oldpass1", newPassword: "short" }));
    expect(short.status).toBe(422);
    const noCsrf = await authRoutes["/api/admin/password"].POST(pwReq(adminToken, { currentPassword: "oldpass1", newPassword: "newpass12" }, false));
    expect(noCsrf.status).toBe(403);
    const ok = await authRoutes["/api/admin/password"].POST(pwReq(adminToken, { currentPassword: "oldpass1", newPassword: "newpass12" }));
    expect(ok.status).toBe(200);
    // Login real con la nueva y rechazo de la vieja.
    const loginNew = await authRoutes["/auth/admin/login"].POST(new Request("http://localhost/auth/admin/login", post(adminToken, { username: "admin", password: "newpass12" })));
    expect(loginNew.status).toBe(200);
    const loginOld = await authRoutes["/auth/admin/login"].POST(new Request("http://localhost/auth/admin/login", post(adminToken, { username: "admin", password: "oldpass1" })));
    expect(loginOld.status).toBe(401);
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'password_changed'").get()?.n).toBe(1);

    // Un admin de Steam no puede cambiar la password de la cuenta local.
    const steamPid = Number(db.run("INSERT INTO participants (steam_id, display_name, role) VALUES ('s-steamadm', 'SA', 'admin')").lastInsertRowid);
    const steamTok = session(db, "participant", steamPid);
    const steamTry = await authRoutes["/api/admin/password"].POST(pwReq(steamTok, { currentPassword: "x", newPassword: "newpass12" }));
    expect(steamTry.status).toBe(403);

    // Auditoría de roles y premios.
    const partyRoutes = createPartyRoutes(db);
    const roleRes = await partyRoutes["/api/admin/participants/:id/role"].PATCH(
      new Request(`http://localhost/api/admin/participants/${steamPid}/role`, { method: "PATCH", headers: { ...cookie(adminToken), "content-type": "application/json" }, body: JSON.stringify({ role: "participant" }) })
    );
    expect(roleRes.status).toBe(200);
    const scoringRoutes = createScoringRoutes(db);
    const awardRes = await scoringRoutes["/api/admin/awards"].POST(
      new Request("http://localhost/api/admin/awards", post(adminToken, { participantId: steamPid, title: "Premio QA" }))
    );
    expect(awardRes.status).toBe(201);
    const audit = db.query<{ action: string }, []>("SELECT action FROM audit_log WHERE action IN ('role_changed', 'award_created')").all().map(r => r.action).sort();
    expect(audit).toEqual(["award_created", "role_changed"]);
  });
});
