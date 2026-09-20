import { Database } from 'bun:sqlite';
import { PartyRepository, AuditRepository } from './repository';
import type { Party, CreatePartyInput, UpdatePartyInput } from '../../shared/contracts/parties';
import { scorePartyParticipation } from '../scoring/service';

export class PartyService {
  private partyRepo: PartyRepository;
  private auditRepo: AuditRepository;

  constructor(private db: Database) {
    this.partyRepo = new PartyRepository(db);
    this.auditRepo = new AuditRepository(db);
  }

  getActive(): Party | null {
    return this.partyRepo.findActive();
  }

  getAll(filter?: { status?: 'planned' | 'active' | 'finished' | 'archived' }): Party[] {
    return this.partyRepo.findAll(filter);
  }

  getById(id: number): Party | null {
    return this.partyRepo.findById(id);
  }

  create(input: CreatePartyInput, adminId: number): Party {
    const party = this.partyRepo.create({
      name: input.name,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      description: input.description ?? null,
      location: input.location ?? null,
    });

    this.auditRepo.record({
      actorAdminId: adminId,
      action: 'created',
      targetType: 'party',
      targetId: party.id,
      metadata: { name: party.name, startsAt: party.startsAt, endsAt: party.endsAt },
    });

    return party;
  }

  update(id: number, input: UpdatePartyInput, adminId: number): Party {
    const party = this.partyRepo.findById(id);
    if (!party) {
      throw new Error('PARTY_NOT_FOUND');
    }

    if (party.status === 'finished' || party.status === 'archived') {
      throw new Error('PARTY_FINALIZED');
    }

    const updated = this.partyRepo.update(id, input);
    if (!updated) {
      throw new Error('PARTY_NOT_FOUND');
    }

    this.auditRepo.record({
      actorAdminId: adminId,
      action: 'updated',
      targetType: 'party',
      targetId: id,
      metadata: { changes: Object.keys(input) },
    });

    return updated;
  }

  activate(id: number, adminId: number): Party {
    const party = this.partyRepo.findById(id);
    if (!party) {
      throw new Error('PARTY_NOT_FOUND');
    }

    // Check if there's already an active party
    const activeParty = this.partyRepo.findActive();
    if (activeParty) {
      throw new Error('ACTIVE_PARTY_EXISTS');
    }

    if (party.status !== 'planned') {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    // Use transaction to ensure atomicity
    const transaction = this.db.transaction(() => {
      const updated = this.partyRepo.updateStatus(id, 'active');
      if (!updated) {
        throw new Error('PARTY_NOT_FOUND');
      }

      this.auditRepo.record({
        actorAdminId: adminId,
        action: 'activated',
        targetType: 'party',
        targetId: id,
        metadata: { previousStatus: 'planned', newStatus: 'active' },
      });

      return updated;
    });

    return transaction();
  }

  finish(id: number, adminId: number): Party {
    const party = this.partyRepo.findById(id);
    if (!party) {
      throw new Error('PARTY_NOT_FOUND');
    }

    if (party.status !== 'active') {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    // Check for unfinished tournaments
    if (this.partyRepo.hasUnfinishedTournaments(id)) {
      throw new Error('UNFINISHED_TOURNAMENTS');
    }

    const transaction = this.db.transaction(() => {
      const updated = this.partyRepo.updateStatus(id, 'finished');
      if (!updated) {
        throw new Error('PARTY_NOT_FOUND');
      }

      this.auditRepo.record({
        actorAdminId: adminId,
        action: 'finished',
        targetType: 'party',
        targetId: id,
        metadata: { previousStatus: 'active', newStatus: 'finished' },
      });

      return updated;
    });

    const result = transaction();
    try { scorePartyParticipation(this.db, id); } catch {}
    return result;
  }

  archive(id: number, adminId: number): Party {
    const party = this.partyRepo.findById(id);
    if (!party) {
      throw new Error('PARTY_NOT_FOUND');
    }

    if (party.status !== 'finished') {
      throw new Error('INVALID_STATUS_TRANSITION');
    }

    const transaction = this.db.transaction(() => {
      const updated = this.partyRepo.updateStatus(id, 'archived');
      if (!updated) {
        throw new Error('PARTY_NOT_FOUND');
      }

      this.auditRepo.record({
        actorAdminId: adminId,
        action: 'archived',
        targetType: 'party',
        targetId: id,
        metadata: { previousStatus: 'finished', newStatus: 'archived' },
      });

      return updated;
    });

    return transaction();
  }

  getAuditLog(filter?: { targetType?: string; targetId?: number }) {
    return this.auditRepo.find(filter);
  }

  // ponytail: borrar en transacción con todas las filas hijas; nada de huérfanos.
  deleteParty(id: number): void {
    const party = this.partyRepo.findById(id);
    if (!party) throw new Error('PARTY_NOT_FOUND');
    // Tolerant with DBs where later domain migrations haven't run yet.
    const existing = new Set(this.db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name));
    this.db.transaction(() => {
      const run = (table: string, sql: string, params: (number | string)[]) => { if (existing.has(table)) this.db.run(sql, params as any); };
      let tourIds: { id: number }[] = [];
      if (existing.has("tournaments")) tourIds = this.db.query<{ id: number }, [number]>("SELECT id FROM tournaments WHERE party_id = ?").all(id);
      for (const t of tourIds) {
        if (existing.has("match_reports") && existing.has("matches")) this.db.run("DELETE FROM match_reports WHERE match_id IN (SELECT id FROM matches WHERE tournament_id = ?)", [t.id]);
        if (existing.has("dispute_votes") && existing.has("matches")) this.db.run("DELETE FROM dispute_votes WHERE match_id IN (SELECT id FROM matches WHERE tournament_id = ?)", [t.id]);
        run("matches", "DELETE FROM matches WHERE tournament_id = ?", [t.id]);
        run("tournament_participants", "DELETE FROM tournament_participants WHERE tournament_id = ?", [t.id]);
      }
      run("tournaments", "DELETE FROM tournaments WHERE party_id = ?", [id]);
      let actIds: { id: number }[] = [];
      if (existing.has("activities")) actIds = this.db.query<{ id: number }, [number]>("SELECT id FROM activities WHERE party_id = ?").all(id);
      for (const a of actIds) run("activity_participants", "DELETE FROM activity_participants WHERE activity_id = ?", [a.id]);
      run("activities", "DELETE FROM activities WHERE party_id = ?", [id]);
      if (existing.has("activity_proposal_votes") && existing.has("activity_proposals")) this.db.run("DELETE FROM activity_proposal_votes WHERE proposal_id IN (SELECT id FROM activity_proposals WHERE party_id = ?)", [id]);
      run("activity_proposals", "DELETE FROM activity_proposals WHERE party_id = ?", [id]);
      if (existing.has("tournament_proposal_votes") && existing.has("tournament_proposals")) this.db.run("DELETE FROM tournament_proposal_votes WHERE proposal_id IN (SELECT id FROM tournament_proposals WHERE party_id = ?)", [id]);
      run("tournament_proposals", "DELETE FROM tournament_proposals WHERE party_id = ?", [id]);
      run("point_ledger", "DELETE FROM point_ledger WHERE party_id = ?", [id]);
      run("participant_awards", "DELETE FROM participant_awards WHERE party_id = ?", [id]);
      run("activity_events", "DELETE FROM activity_events WHERE party_id = ?", [id]);
      run("party_scoring_runs", "DELETE FROM party_scoring_runs WHERE party_id = ?", [id]);
      run("party_memberships", "DELETE FROM party_memberships WHERE party_id = ?", [id]);
      run("audit_log", "DELETE FROM audit_log WHERE target_type = 'party' AND target_id = ?", [id]);
      this.db.run("DELETE FROM parties WHERE id = ?", [id]);
    })();
  }
}
