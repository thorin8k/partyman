import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { createPublicRoutes } from "../src/backend/routes/public";

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("CREATE TABLE parties (id INTEGER PRIMARY KEY, name TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, description TEXT, location TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  db.exec("CREATE TABLE participants (id INTEGER PRIMARY KEY, steam_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, avatar_url TEXT, role TEXT NOT NULL DEFAULT 'participant', created_at TEXT NOT NULL)");
  db.exec("CREATE TABLE party_memberships (party_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, display_name_snapshot TEXT NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY (party_id, participant_id))");
  db.exec("CREATE TABLE games (id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, min_players INTEGER, max_players INTEGER, duration_minutes INTEGER, setup_notes TEXT, image_path TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  db.exec("CREATE TABLE activities (id INTEGER PRIMARY KEY, party_id INTEGER NOT NULL, game_id INTEGER, game_title_snapshot TEXT, tournament_id INTEGER, title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, capacity INTEGER, notes TEXT, status TEXT NOT NULL DEFAULT 'scheduled', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  db.exec("CREATE TABLE activity_participants (activity_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY(activity_id, participant_id))");
  db.exec("CREATE TABLE tournaments (id INTEGER PRIMARY KEY, party_id INTEGER NOT NULL, game_id INTEGER NOT NULL, game_title_snapshot TEXT NOT NULL, activity_id INTEGER, name TEXT NOT NULL, format TEXT NOT NULL DEFAULT 'single_elimination', status TEXT NOT NULL DEFAULT 'draft', max_participants INTEGER NOT NULL DEFAULT 16, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  db.exec("CREATE TABLE tournament_participants (tournament_id INTEGER NOT NULL, participant_id INTEGER NOT NULL, display_name_snapshot TEXT NOT NULL, seed INTEGER NOT NULL, PRIMARY KEY(tournament_id, participant_id))");
  db.exec("CREATE TABLE matches (id INTEGER PRIMARY KEY, tournament_id INTEGER NOT NULL, round INTEGER NOT NULL, position INTEGER NOT NULL, participant_a_id INTEGER, participant_b_id INTEGER, winner_id INTEGER, score_json TEXT, status TEXT NOT NULL DEFAULT 'pending', reported_by INTEGER, reported_at TEXT, confirmed_at TEXT, version INTEGER DEFAULT 0, UNIQUE(tournament_id, round, position))");
  return db;
}

describe("public state", () => {
  it("returns null party when no active party", async () => {
    const db = makeDb();
    const routes = createPublicRoutes(db);
    const res = routes["/api/public/state"].GET();
    const body = await res.json();
    expect(body.party).toBeNull();
    expect(body.attendees).toEqual([]);
    expect(body.generatedAt).toBeTruthy();
  });

  it("exposes the canonical join URL for the display QR", async () => {
    const db = makeDb();
    const withOrigin = await (await createPublicRoutes(db, { publicOrigin: "http://192.168.1.100:8400/" })["/api/public/state"].GET()).json();
    expect(withOrigin.joinUrl).toBe("http://192.168.1.100:8400");
    // Sin puerta configurada, el QR apunta a la URL limpia.
    expect(withOrigin.qrUrl).toBe("http://192.168.1.100:8400");

    const noOrigin = await (await createPublicRoutes(db, { publicOrigin: "" })["/api/public/state"].GET()).json();
    expect(noOrigin.joinUrl).toBeNull();
  });

  it("embeds the access password in the QR url when the gate is set", async () => {
    const db = makeDb();
    process.env.ACCESS_PASSWORD = "s3cret party";
    try {
      const body = await (await createPublicRoutes(db, { publicOrigin: "https://party.example" })["/api/public/state"].GET()).json();
      expect(body.joinUrl).toBe("https://party.example");
      expect(body.qrUrl).toBe("https://party.example/?access=s3cret%20party");
    } finally {
      delete process.env.ACCESS_PASSWORD;
    }
  });

  it("returns active party with attendees", async () => {
    const db = makeDb();
    db.run("INSERT INTO parties (name, starts_at, ends_at, status, created_at, updated_at) VALUES ('Test Party', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')");
    db.run("INSERT INTO participants (steam_id, display_name, role, created_at) VALUES ('123', 'Player1', 'participant', '2026-01-01T00:00:00Z')");
    db.run("INSERT INTO participants (steam_id, display_name, role, created_at) VALUES ('456', 'Player2', 'admin', '2026-01-01T00:00:00Z')");
    db.run("INSERT INTO party_memberships (party_id, participant_id, display_name_snapshot, joined_at) VALUES (1, 1, 'Player1', '2026-01-01T00:01:00Z')");
    db.run("INSERT INTO party_memberships (party_id, participant_id, display_name_snapshot, joined_at) VALUES (1, 2, 'Player2', '2026-01-01T00:02:00Z')");

    const routes = createPublicRoutes(db);
    const res = routes["/api/public/state"].GET();
    const body = await res.json();

    expect(body.party).not.toBeNull();
    expect(body.party.name).toBe("Test Party");
    expect(body.party.status).toBe("active");
    expect(body.attendees).toHaveLength(2);
    expect(body.attendees[0].displayName).toBe("Player1");
    expect(body.attendees[1].displayName).toBe("Player2");
  });

  it("exposes activities and the activity feed", async () => {
    const db = makeDb();
    db.run("INSERT INTO parties (name, starts_at, ends_at, status, created_at, updated_at) VALUES ('P', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')");
    const past = new Date(Date.now() - 7200_000).toISOString();
    const future = new Date(Date.now() + 7200_000).toISOString();
    db.run("INSERT INTO activities (party_id, title, starts_at, ends_at, status, created_at, updated_at) VALUES (1, 'Live', ?, ?, 'scheduled', ?, ?)", [past, future, past, past]);
    db.run("INSERT INTO activities (party_id, title, starts_at, ends_at, status, created_at, updated_at) VALUES (1, 'Old', '2020-01-01T00:00:00Z', '2020-01-01T01:00:00Z', 'finished', ?, ?)", [past, past]);
    db.exec("CREATE TABLE activity_events (id INTEGER PRIMARY KEY, party_id INTEGER, participant_id INTEGER, event_type TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL)");
    db.run("INSERT INTO activity_events (party_id, event_type, message, created_at) VALUES (1, 'tournament_win', 'Ganó torneo Cup', ?)", [past]);

    const body = await (await createPublicRoutes(db)["/api/public/state"].GET()).json();
    const byTitle = Object.fromEntries(body.activities.map((a: any) => [a.title, a.status]));
    expect(byTitle).toEqual({ Live: "scheduled", Old: "finished" });
    expect(body.activity).toHaveLength(1);
    expect(body.activity[0].message).toBe("Ganó torneo Cup");
  });

  it("exposes no admin data or sessions", async () => {
    const db = makeDb();
    db.run("INSERT INTO parties (name, starts_at, ends_at, status, created_at, updated_at) VALUES ('P', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')");

    const routes = createPublicRoutes(db);
    const res = routes["/api/public/state"].GET();
    const body = await res.json();
    const json = JSON.stringify(body);

    expect(json).not.toContain("session");
    expect(json).not.toContain("admin");
    expect(json).not.toContain("steam_id");
  });
});
