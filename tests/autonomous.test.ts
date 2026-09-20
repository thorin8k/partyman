import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PartyService } from "../src/backend/parties/service";
import { scoreTournamentFinished, seedAchievements, seedPointRules } from "../src/backend/scoring/service";
import { confirmMatchRow, createTournamentRoutes } from "../src/backend/routes/tournaments";
import { createActivityTournamentProposalRoutes } from "../src/backend/routes/activity-tournament-proposals";
import { createPartyRoutes } from "../src/backend/routes/parties";

const migrationsDir = join(import.meta.dir, "..", "migrations");

async function fullSchema(db: Database) {
  db.exec("CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)");
  const files = ["001_core.sql", "002_auth_participants.sql", "003_parties_audit.sql", "004_public_views.sql", "005_games_planning.sql", "006_tournaments.sql", "007_history_rewards.sql", "008_operations.sql", "010_steam_admin_role.sql", "011_activity_tournament_proposals.sql", "014_autonomous.sql", "015_optional_scores.sql", "016_tournament_formats.sql"];
  for (const file of files) {
    db.exec(await Bun.file(join(migrationsDir, file)).text());
    db.run("INSERT INTO migrations (name) VALUES (?)", [file.replace(".sql", "")]);
  }
}

function session(db: Database, type: string, id: number): string {
  const token = `auto-${type}-${id}-` + Math.random().toString(36).slice(2);
  const hash = new Bun.CryptoHasher("sha256").update(token).digest("hex");
  db.run("INSERT INTO sessions (id_hash, subject_type, subject_id, csrf_token, expires_at) VALUES (?, ?, ?, 'csrf', datetime('now', '+1 day'))", [hash, type, id]);
  return token;
}

const cookie = (t: string) => ({ cookie: `partyman_session=${t}` });
const post = (t: string, body?: unknown) => ({
  method: "POST",
  headers: { ...cookie(t), ...(body ? { "content-type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

function member(db: Database, steam: string, name: string, partyId: number): { id: number; token: string } {
  const id = Number(db.run("INSERT INTO participants (steam_id, display_name) VALUES (?, ?)", [steam, name]).lastInsertRowid);
  db.run("INSERT INTO party_memberships (party_id, participant_id, display_name_snapshot) VALUES (?, ?, ?)", [partyId, id, name]);
  return { id, token: session(db, "participant", id) };
}

describe("task 014 autonomous mode", () => {
  let db: Database;
  let tmp: string;
  let adminToken: string;
  let partyId: number;

  beforeAll(async () => {
    db = new Database(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    await fullSchema(db);
    seedPointRules(db);
    seedAchievements(db);
    db.run("INSERT INTO admin_users (username, password_hash) VALUES ('admin', 'hash')");
    adminToken = session(db, "admin", 1);
    partyId = Number(db.run("INSERT INTO parties (name, starts_at, ends_at, status) VALUES ('Auto', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'active')").lastInsertRowid);
    tmp = mkdtempSync(join(tmpdir(), "partyman-auto-"));
    process.env.BACKUP_DIR = tmp;
  });

  afterAll(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
    delete process.env.BACKUP_DIR;
  });

  it("auto-approves an activity proposal at 3 votes", async () => {
    const routes = createActivityTournamentProposalRoutes(db);
    const voters = ["v1", "v2", "v3"].map((s, i) => member(db, `steam-${s}`, `Voter${i}`, partyId));
    const pid = Number(db.run(
      "INSERT INTO activity_proposals (party_id, title, starts_at, ends_at, created_by_participant_id) VALUES (?, 'Karaoke', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', ?)",
      [partyId, voters[0].id]
    ).lastInsertRowid);
    for (let i = 0; i < 2; i++) {
      const r = await routes["/api/activity-proposals/:id/vote"].PUT(
        new Request(`http://localhost/api/activity-proposals/${pid}/vote`, { method: "PUT", headers: cookie(voters[i].token) })
      );
      expect((await r.json()).approved ?? false).toBe(false);
    }
    const third = await routes["/api/activity-proposals/:id/vote"].PUT(
      new Request(`http://localhost/api/activity-proposals/${pid}/vote`, { method: "PUT", headers: cookie(voters[2].token) })
    );
    expect((await third.json()).approved).toBe(true);
    expect(db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM activities WHERE title = 'Karaoke'").get()?.n).toBe(1);
    expect(db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM activity_proposals WHERE id = ?").get(pid)?.n).toBe(0);
  });

  it("auto-starts a tournament when it fills up", async () => {
    const routes = createTournamentRoutes(db);
    db.run("INSERT INTO games (title, enabled) VALUES ('AutoGame', 1)");
    const gameId = Number(db.query<{ id: number }, []>("SELECT id FROM games WHERE title = 'AutoGame'").get()?.id);
    const created = await routes["/api/admin/tournaments"].POST(
      new Request("http://localhost/api/admin/tournaments", post(adminToken, { partyId, gameId, name: "AutoCup", maxParticipants: 2 }))
    );
    const tourId = (await created.json()).tournament.id;
    const t = db.query<{ status: string }, [number]>("SELECT status FROM tournaments WHERE id = ?").get(tourId)!;
    expect(t.status).toBe("upcoming");
    const a = member(db, "steam-a1", "A1", partyId);
    const b = member(db, "steam-b1", "B1", partyId);
    await routes["/api/tournaments/:id/join"].POST(new Request(`http://localhost/api/tournaments/${tourId}/join`, post(a.token)));
    const join = await routes["/api/tournaments/:id/join"].POST(new Request(`http://localhost/api/tournaments/${tourId}/join`, post(b.token)));
    expect((await join.json()).started).toBe(true);
    expect(db.query<{ status: string }, [number]>("SELECT status FROM tournaments WHERE id = ?").get(tourId)?.status).toBe("in_progress");
    expect(db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM matches WHERE tournament_id = ?").get(tourId)?.n).toBeGreaterThan(0);
  });

  it("confirms unanimous reports on timeout and never conflicts", async () => {
    const routes = createTournamentRoutes(db);
    const gameId = db.query<{ id: number }, []>("SELECT id FROM games LIMIT 1").get()!.id;
    const created = await routes["/api/admin/tournaments"].POST(
      new Request("http://localhost/api/admin/tournaments", post(adminToken, { partyId, gameId, name: "TimeoutCup", maxParticipants: 2 }))
    );
    const tourId = (await created.json()).tournament.id;
    const t1 = member(db, "steam-t1", "T1", partyId);
    const t2 = member(db, "steam-t2", "T2", partyId);
    await routes["/api/tournaments/:id/join"].POST(new Request(`http://localhost/api/tournaments/${tourId}/join`, post(t1.token)));
    await routes["/api/tournaments/:id/join"].POST(new Request(`http://localhost/api/tournaments/${tourId}/join`, post(t2.token)));
    expect(db.query<{ status: string }, [number]>("SELECT status FROM tournaments WHERE id = ?").get(tourId)?.status).toBe("in_progress");
    const match = db.query<{ id: number; a: number | null; b: number | null }, [number]>("SELECT id, participant_a_id AS a, participant_b_id AS b FROM matches WHERE tournament_id = ?").get(tourId)!;
    const score = match.a === t1.id ? { a: 5, b: 1 } : { a: 1, b: 5 };
    await routes["/api/matches/:id/report"].POST(
      new Request(`http://localhost/api/matches/${match.id}/report`, post(t1.token, { winnerId: t1.id, score }))
    );
    expect(db.query<{ status: string }, [number]>("SELECT status FROM matches WHERE id = ?").get(match.id)?.status).toBe("reported");
    db.run("UPDATE matches SET reported_at = '2020-01-01T00:00:00Z' WHERE id = ?", [match.id]);
    const detail = await routes["/api/tournaments/:id"].GET(
      new Request(`http://localhost/api/tournaments/${tourId}`, { headers: cookie(adminToken) })
    );
    expect((await detail.json()).tournament.matches[0].status).toBe("confirmed");
  });

  it("lets the opponent confirm a report in one tap, but not the reporter", async () => {
    const routes = createTournamentRoutes(db);
    const gameId = db.query<{ id: number }, []>("SELECT id FROM games LIMIT 1").get()!.id;
    const created = await routes["/api/admin/tournaments"].POST(
      new Request("http://localhost/api/admin/tournaments", post(adminToken, { partyId, gameId, name: "ConfirmCup", maxParticipants: 2 }))
    );
    const tourId = (await created.json()).tournament.id;
    const c1 = member(db, "steam-c1", "C1", partyId);
    const c2 = member(db, "steam-c2", "C2", partyId);
    await routes["/api/tournaments/:id/join"].POST(new Request(`http://localhost/api/tournaments/${tourId}/join`, post(c1.token)));
    await routes["/api/tournaments/:id/join"].POST(new Request(`http://localhost/api/tournaments/${tourId}/join`, post(c2.token)));
    const match = db.query<{ id: number; a: number | null; b: number | null }, [number]>("SELECT id, participant_a_id AS a, participant_b_id AS b FROM matches WHERE tournament_id = ?").get(tourId)!;
    const score = match.a === c1.id ? { a: 5, b: 2 } : { a: 2, b: 5 };
    await routes["/api/matches/:id/report"].POST(
      new Request(`http://localhost/api/matches/${match.id}/report`, post(c1.token, { winnerId: c1.id, score }))
    );
    expect(db.query<{ status: string }, [number]>("SELECT status FROM matches WHERE id = ?").get(match.id)?.status).toBe("reported");
    const self = await routes["/api/matches/:id/confirm"].POST(
      new Request(`http://localhost/api/matches/${match.id}/confirm`, post(c1.token))
    );
    expect(self.status).toBe(403);
    const ok = await routes["/api/matches/:id/confirm"].POST(
      new Request(`http://localhost/api/matches/${match.id}/confirm`, post(c2.token))
    );
    expect(ok.status).toBe(200);
    expect(db.query<{ status: string }, [number]>("SELECT status FROM matches WHERE id = ?").get(match.id)?.status).toBe("confirmed");
    expect(db.query<{ winner_id: number }, [number]>("SELECT winner_id FROM matches WHERE id = ?").get(match.id)?.winner_id).toBe(c1.id);
    const again = await routes["/api/matches/:id/confirm"].POST(
      new Request(`http://localhost/api/matches/${match.id}/confirm`, post(c2.token))
    );
    expect(again.status).toBe(409);
  });

  it("resolves conflicting reports by outsider majority", async () => {
    const routes = createTournamentRoutes(db);
    const gameId = db.query<{ id: number }, []>("SELECT id FROM games LIMIT 1").get()!.id;
    const created = await routes["/api/admin/tournaments"].POST(
      new Request("http://localhost/api/admin/tournaments", post(adminToken, { partyId, gameId, name: "DisputeCup", maxParticipants: 8 }))
    );
    const tourId = (await created.json()).tournament.id;
    const players = ["d1", "d2", "d3", "d4"].map((s, i) => member(db, `steam-${s}`, `D${i}`, partyId));
    for (const p of players) {
      await routes["/api/admin/tournaments/:id/participants"].POST(
        new Request(`http://localhost/api/admin/tournaments/${tourId}/participants`, post(adminToken, { participantId: p.id }))
      );
    }
    db.run("UPDATE tournaments SET status = 'in_progress' WHERE id = ?", [tourId]);
    const m1 = players[0].id, m2 = players[1].id;
    db.run("INSERT INTO matches (tournament_id, round, position, participant_a_id, participant_b_id, status) VALUES (?, 1, 0, ?, ?, 'pending')", [tourId, m1, m2]);
    const matchId = Number(db.query<{ id: number }, []>("SELECT last_insert_rowid() AS id").get()?.id);
    // A second pending match keeps the tournament live so the wizard-block test below holds.
    const m3 = players[2].id, m4 = players[3].id;
    db.run("INSERT INTO matches (tournament_id, round, position, participant_a_id, participant_b_id, status) VALUES (?, 1, 1, ?, ?, 'pending')", [tourId, m3, m4]);
    const rep = (tok: string, winner: number, a: number, b: number) =>
      routes["/api/matches/:id/report"].POST(new Request(`http://localhost/api/matches/${matchId}/report`, post(tok, { winnerId: winner, score: { a, b } })));
    await rep(players[0].token, m1, 5, 3);
    const conflict = await rep(players[1].token, m2, 2, 5);
    expect((await conflict.json()).status).toBe("reported");
    // A player cannot vote on their own dispute.
    const selfVote = await routes["/api/disputes/:id/vote"].POST(
      new Request(`http://localhost/api/disputes/${matchId}/vote`, post(players[0].token, { winnerId: m1 }))
    );
    expect(selfVote.status).toBe(403);
    // Both outsiders back m1 → majority of 2 outsiders → confirmed.
    await routes["/api/disputes/:id/vote"].POST(new Request(`http://localhost/api/disputes/${matchId}/vote`, post(players[2].token, { winnerId: m1 })));
    const decided = await routes["/api/disputes/:id/vote"].POST(new Request(`http://localhost/api/disputes/${matchId}/vote`, post(players[3].token, { winnerId: m1 })));
    expect((await decided.json()).status).toBe("confirmed");
    expect(db.query<{ winner_id: number }, [number]>("SELECT winner_id FROM matches WHERE id = ?").get(matchId)?.winner_id).toBe(m1);
  });

  it("awards auto achievements exactly once and closes via wizard", async () => {
    const tRoutes = createTournamentRoutes(db);
    const pRoutes = createPartyRoutes(db);
    const service = new PartyService(db);
    // Finish AutoCup: both agree → winner points + first_win + tournament participation.
    const tourId = db.query<{ id: number }, [string]>("SELECT id FROM tournaments WHERE name = ?").get("AutoCup")!.id;
    const a = db.query<{ id: number }, [string]>("SELECT id FROM participants WHERE display_name = ?").get("A1")!.id;
    const b = db.query<{ id: number }, [string]>("SELECT id FROM participants WHERE display_name = ?").get("B1")!.id;
    const mid = db.query<{ id: number }, [number]>("SELECT id FROM matches WHERE tournament_id = ? LIMIT 1").get(tourId)!.id;
    const slots = db.query<{ a: number | null; b: number | null }, [number]>("SELECT participant_a_id AS a, participant_b_id AS b FROM matches WHERE id = ?").get(mid)!;
    const ascore = slots.a === a ? { a: 5, b: 1 } : { a: 1, b: 5 };
    await tRoutes["/api/matches/:id/report"].POST(
      new Request(`http://localhost/api/matches/${mid}/report`, post(session(db, "participant", a), { winnerId: a, score: ascore }))
    );
    await tRoutes["/api/matches/:id/report"].POST(
      new Request(`http://localhost/api/matches/${mid}/report`, post(session(db, "participant", b), { winnerId: a, score: ascore }))
    );
    expect(db.query<{ status: string }, [number]>("SELECT status FROM matches WHERE id = ?").get(mid)?.status).toBe("confirmed");
    const awards = (code: string, pid: number) => db.query<{ n: number }, [string, number]>(
      "SELECT COUNT(*) AS n FROM participant_awards pa JOIN achievements a ON a.id = pa.achievement_id WHERE a.code = ? AND pa.participant_id = ?"
    ).get(code, pid)?.n ?? 0;
    expect(awards("first_win", a)).toBe(1);
    // Re-scoring never duplicates.
    scoreTournamentFinished(db, tourId, partyId);
    expect(awards("first_win", a)).toBe(1);
    expect(db.query<{ n: number }, [number, number]>("SELECT COUNT(*) AS n FROM point_ledger WHERE reason = 'tournament_participation' AND party_id = ? AND participant_id = ?").get(partyId, a)?.n).toBe(1);
    expect(db.query<{ n: number }, [number, number]>("SELECT COUNT(*) AS n FROM point_ledger WHERE reason = 'tournament_participation' AND party_id = ? AND participant_id = ?").get(partyId, b)?.n).toBe(1);

    // Wizard blocks while DisputeCup is live, then closes cleanly.
    const blocked = await pRoutes["/api/admin/parties/:id/close"].POST(
      new Request(`http://localhost/api/admin/parties/${partyId}/close`, post(adminToken))
    );
    expect(blocked.status).toBe(409);
    db.run("UPDATE tournaments SET status = 'cancelled' WHERE name = 'DisputeCup'");
    const done = await pRoutes["/api/admin/parties/:id/close"].POST(
      new Request(`http://localhost/api/admin/parties/${partyId}/close`, post(adminToken))
    );
    expect(done.status).toBe(200);
    const body = await done.json();
    expect(body.steps.map((s: any) => s.key)).toEqual(["cancel", "finish", "backup"]);
    expect(service.getById(partyId)?.status).toBe("finished");
    expect(db.query<{ n: number }, [string]>("SELECT COUNT(*) AS n FROM participant_awards pa JOIN achievements a ON a.id = pa.achievement_id WHERE a.code = 'party_mvp'").get("party_mvp")?.n ?? 0).toBeGreaterThan(0);
  });

  const awardCount = (code: string, pid: number) => db.query<{ n: number }, [string, number]>(
    "SELECT COUNT(*) AS n FROM participant_awards pa JOIN achievements a ON a.id = pa.achievement_id WHERE a.code = ? AND pa.participant_id = ?"
  ).get(code, pid)?.n ?? 0;

  const mkTournament = (name: string, status: string) => Number(db.run(
    "INSERT INTO tournaments (party_id, game_id, game_title_snapshot, name, status) VALUES (?, ?, 'Game', ?, ?)",
    [partyId, db.query<{ id: number }, []>("SELECT id FROM games LIMIT 1").get()!.id, name, status]
  ).lastInsertRowid);

  it("awards goleada only on an 8+ margin with a recorded score", () => {
    const g1 = member(db, "steam-gol1", "Gol1", partyId);
    const g2 = member(db, "steam-gol2", "Gol2", partyId);
    const t = mkTournament("GolCup", "in_progress");
    db.run("INSERT INTO matches (tournament_id, round, position, participant_a_id, participant_b_id, status) VALUES (?, 1, 0, ?, ?, 'pending')", [t, g1.id, g2.id]);
    const match = db.query<any, [number]>("SELECT * FROM matches WHERE tournament_id = ?").get(t)!;
    confirmMatchRow(db, match, g1.id, JSON.stringify({ a: 10, b: 2 }), null);
    expect(awardCount("goleada", g1.id)).toBe(1);
    confirmMatchRow(db, match, g1.id, JSON.stringify({ a: 10, b: 2 }), null);
    expect(awardCount("goleada", g1.id)).toBe(1);

    const g3 = member(db, "steam-gol3", "Gol3", partyId);
    const t2 = mkTournament("SmallCup", "in_progress");
    db.run("INSERT INTO matches (tournament_id, round, position, participant_a_id, participant_b_id, status) VALUES (?, 1, 0, ?, ?, 'pending')", [t2, g3.id, g2.id]);
    const match2 = db.query<any, [number]>("SELECT * FROM matches WHERE tournament_id = ?").get(t2)!;
    confirmMatchRow(db, match2, g3.id, JSON.stringify({ a: 5, b: 3 }), null);
    expect(awardCount("goleada", g3.id)).toBe(0);
  });

  it("awards intocable and fiel when scoring, idempotently", () => {
    const p = member(db, "steam-fiel", "Fiel", partyId);
    const opp = member(db, "steam-fielopp", "FielOpp", partyId);
    for (let i = 0; i < 4; i++) {
      const prev = mkTournament(`Prev${i}`, "finished");
      db.run("INSERT INTO tournament_participants (tournament_id, participant_id, display_name_snapshot, seed) VALUES (?, ?, 'Fiel', 1)", [prev, p.id]);
    }
    const t = mkTournament("FielCup", "finished");
    db.run("INSERT INTO tournament_participants (tournament_id, participant_id, display_name_snapshot, seed) VALUES (?, ?, 'Fiel', 1), (?, ?, 'FielOpp', 2)", [t, p.id, t, opp.id]);
    db.run("INSERT INTO matches (tournament_id, round, position, participant_a_id, participant_b_id, winner_id, status) VALUES (?, 1, 0, ?, ?, ?, 'confirmed')", [t, p.id, opp.id, p.id]);
    scoreTournamentFinished(db, t, partyId);
    expect(awardCount("intocable", p.id)).toBe(1);
    expect(awardCount("fiel", p.id)).toBe(1);
    scoreTournamentFinished(db, t, partyId);
    expect(awardCount("intocable", p.id)).toBe(1);
    expect(awardCount("fiel", p.id)).toBe(1);
  });

  it("awards ideologo to the proposer on admin approval", async () => {
    const routes = createActivityTournamentProposalRoutes(db);
    const p = member(db, "steam-ideo", "Ideo", partyId);
    const pid = Number(db.run(
      "INSERT INTO activity_proposals (party_id, title, starts_at, ends_at, created_by_participant_id) VALUES (?, 'Taller', '2026-01-01T12:00:00Z', '2026-01-01T13:00:00Z', ?)",
      [partyId, p.id]
    ).lastInsertRowid);
    const res = await routes["/api/admin/activity-proposals/:id/approve"].POST(
      new Request(`http://localhost/api/admin/activity-proposals/${pid}/approve`, post(adminToken))
    );
    expect(res.status).toBe(200);
    expect(awardCount("ideologo", p.id)).toBe(1);
  });
});
