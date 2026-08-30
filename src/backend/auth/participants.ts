import { Database } from "bun:sqlite";

export type ParticipantRole = "participant" | "admin";

export interface Participant {
  id: number;
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  role: ParticipantRole;
}

export interface ActiveParty {
  id: number;
}

interface ParticipantRow {
  id: number;
  steam_id: string;
  display_name: string;
  avatar_url: string | null;
  role: ParticipantRole;
}

export function upsertParticipant(
  db: Database,
  steamId: string,
  displayName: string,
  avatarUrl: string | null,
): Participant {
  const existing = db
    .query<ParticipantRow, [string]>("SELECT id, steam_id, display_name, avatar_url, role FROM participants WHERE steam_id = ?")
    .get(steamId);

  if (existing) {
    db.run("UPDATE participants SET display_name = ?, avatar_url = ? WHERE id = ?", [
      displayName,
      avatarUrl,
      existing.id,
    ]);
    return { id: existing.id, steamId, displayName, avatarUrl, role: existing.role };
  }

  const result = db.run("INSERT INTO participants (steam_id, display_name, avatar_url) VALUES (?, ?, ?)", [
    steamId,
    displayName,
    avatarUrl,
  ]);
  const id = Number(result.lastInsertRowid);
  return { id, steamId, displayName, avatarUrl, role: "participant" };
}

export function findParticipantById(db: Database, id: number): Participant | null {
  const row = db
    .query<ParticipantRow, [number]>("SELECT id, steam_id, display_name, avatar_url, role FROM participants WHERE id = ?")
    .get(id);
  if (!row) return null;
  return { id: row.id, steamId: row.steam_id, displayName: row.display_name, avatarUrl: row.avatar_url, role: row.role };
}

export function findParticipantBySteamId(db: Database, steamId: string): Participant | null {
  const row = db
    .query<ParticipantRow, [string]>("SELECT id, steam_id, display_name, avatar_url, role FROM participants WHERE steam_id = ?")
    .get(steamId);
  if (!row) return null;
  return { id: row.id, steamId: row.steam_id, displayName: row.display_name, avatarUrl: row.avatar_url, role: row.role };
}

export function setParticipantRole(db: Database, participantId: number, role: ParticipantRole): void {
  db.run("UPDATE participants SET role = ? WHERE id = ?", [role, participantId]);
}

export function getAllParticipants(db: Database): Participant[] {
  const rows = db
    .query<ParticipantRow, []>("SELECT id, steam_id, display_name, avatar_url, role FROM participants ORDER BY display_name")
    .all();
  return rows.map(row => ({
    id: row.id,
    steamId: row.steam_id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
  }));
}

export function findActiveParty(db: Database): ActiveParty | null {
  const row = db
    .query<{ id: number }, []>("SELECT id FROM parties WHERE status = 'active' LIMIT 1")
    .get();
  return row ? { id: row.id } : null;
}

export function joinActiveParty(db: Database, participantId: number, displayName: string): boolean {
  const party = findActiveParty(db);
  if (!party) return false;
  db.run(
    "INSERT OR IGNORE INTO party_memberships (party_id, participant_id, display_name_snapshot) VALUES (?, ?, ?)",
    [party.id, participantId, displayName],
  );
  return true;
}
