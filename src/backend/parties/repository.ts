import { Database } from 'bun:sqlite';
import type { Party, PartyStatus, AuditLogEntry, AuditLogFilter } from '../../shared/contracts/parties';

interface PartyRow {
  id: number;
  name: string;
  starts_at: string;
  ends_at: string;
  description: string | null;
  location: string | null;
  status: PartyStatus;
  created_at: string;
  updated_at: string;
}

interface AuditLogRow {
  id: number;
  actor_participant_id: number | null;
  actor_admin_id: number | null;
  action: string;
  target_type: string;
  target_id: number;
  metadata_json: string;
  created_at: string;
}

function rowToParty(row: PartyRow): Party {
  return {
    id: row.id,
    name: row.name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    description: row.description,
    location: row.location,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToAuditLog(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    actorParticipantId: row.actor_participant_id,
    actorAdminId: row.actor_admin_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
  };
}

export class PartyRepository {
  constructor(private db: Database) {}

  findById(id: number): Party | null {
    const row = this.db
      .query<PartyRow, [number]>('SELECT * FROM parties WHERE id = ?')
      .get(id);
    return row ? rowToParty(row) : null;
  }

  findActive(): Party | null {
    const row = this.db
      .query<PartyRow, []>("SELECT * FROM parties WHERE status = 'active' LIMIT 1")
      .get();
    return row ? rowToParty(row) : null;
  }

  findAll(filter?: { status?: PartyStatus }): Party[] {
    let query = 'SELECT * FROM parties';
    const params: any[] = [];

    if (filter?.status) {
      query += ' WHERE status = ?';
      params.push(filter.status);
    }

    query += ' ORDER BY starts_at DESC';

    const rows = this.db.query<PartyRow, any[]>(query).all(...params);
    return rows.map(rowToParty);
  }

  create(input: {
    name: string;
    startsAt: string;
    endsAt: string;
    description: string | null;
    location: string | null;
  }): Party {
    const now = new Date().toISOString();
    const result = this.db.run(
      `INSERT INTO parties (name, starts_at, ends_at, description, location, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'planned', ?, ?)`,
      [input.name, input.startsAt, input.endsAt, input.description, input.location, now, now]
    );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(id: number, input: {
    name?: string;
    startsAt?: string;
    endsAt?: string;
    description?: string | null;
    location?: string | null;
  }): Party | null {
    const party = this.findById(id);
    if (!party) return null;

    const updates: string[] = [];
    const params: any[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      params.push(input.name);
    }
    if (input.startsAt !== undefined) {
      updates.push('starts_at = ?');
      params.push(input.startsAt);
    }
    if (input.endsAt !== undefined) {
      updates.push('ends_at = ?');
      params.push(input.endsAt);
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      params.push(input.description);
    }
    if (input.location !== undefined) {
      updates.push('location = ?');
      params.push(input.location);
    }

    if (updates.length === 0) return party;

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    this.db.run(`UPDATE parties SET ${updates.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  updateStatus(id: number, status: PartyStatus): Party | null {
    const now = new Date().toISOString();
    this.db.run(
      'UPDATE parties SET status = ?, updated_at = ? WHERE id = ?',
      [status, now, id]
    );
    return this.findById(id);
  }

  hasUnfinishedTournaments(partyId: number): boolean {
    // Check if tournaments table exists (it's created in task 006)
    const tableExists = this.db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='tournaments'"
      )
      .get();

    if (!tableExists || tableExists.count === 0) {
      return false;
    }

    const row = this.db
      .query<{ count: number }, [number]>(
        "SELECT COUNT(*) as count FROM tournaments WHERE party_id = ? AND status IN ('upcoming', 'in_progress')"
      )
      .get(partyId);
    return (row?.count ?? 0) > 0;
  }
}

export class AuditRepository {
  constructor(private db: Database) {}

  record(input: {
    actorParticipantId?: number;
    actorAdminId?: number;
    action: string;
    targetType: string;
    targetId: number;
    metadata?: Record<string, any>;
  }): AuditLogEntry {
    const now = new Date().toISOString();
    const metadataJson = JSON.stringify(input.metadata ?? {});

    const result = this.db.run(
      `INSERT INTO audit_log (actor_participant_id, actor_admin_id, action, target_type, target_id, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.actorParticipantId ?? null,
        input.actorAdminId ?? null,
        input.action,
        input.targetType,
        input.targetId,
        metadataJson,
        now,
      ]
    );

    const row = this.db
      .query<AuditLogRow, [number]>('SELECT * FROM audit_log WHERE id = ?')
      .get(Number(result.lastInsertRowid));

    return rowToAuditLog(row!);
  }

  find(filter?: AuditLogFilter): AuditLogEntry[] {
    let query = 'SELECT * FROM audit_log';
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter?.targetType) {
      conditions.push('target_type = ?');
      params.push(filter.targetType);
    }
    if (filter?.targetId !== undefined) {
      conditions.push('target_id = ?');
      params.push(filter.targetId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC LIMIT 100';

    const rows = this.db.query<AuditLogRow, any[]>(query).all(...params);
    return rows.map(rowToAuditLog);
  }
}
