import { Database } from 'bun:sqlite';
import { PartyRepository, AuditRepository } from './repository';
import type { Party, CreatePartyInput, UpdatePartyInput } from '../../shared/contracts/parties';

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

    return transaction();
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
}
