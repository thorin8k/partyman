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

  it("exposes no admin data or sessions", async () => {
    const db = makeDb();
    db.run("INSERT INTO parties (name, starts_at, ends_at, status, created_at, updated_at) VALUES ('P', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 'active', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')");

    const routes = createPublicRoutes(db);
    const res = routes["/api/public/state"].GET();
    const body = await res.json();
    const json = JSON.stringify(body);

    expect(json).not.toContain("session");
    expect(json).not.toContain("admin");
    expect(json).not.toContain("password");
    expect(json).not.toContain("steam_id");
  });
});
