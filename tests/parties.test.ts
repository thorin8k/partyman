import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { PartyService } from '../src/backend/parties/service';

const migrationsDir = join(import.meta.dir, '..', 'migrations');

async function runMigrations(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = ["001_core.sql", "002_auth_participants.sql", "003_parties_audit.sql"];
  for (const file of files) {
    const name = file.replace(".sql", "");
    const executed = db.query("SELECT id FROM migrations WHERE name = ?").get(name);
    if (!executed) {
      const sql = await Bun.file(join(migrationsDir, file)).text();
      db.exec(sql);
      db.query("INSERT INTO migrations (name) VALUES (?)").run(name);
    }
  }
}

describe('Task 003: Party Lifecycle', () => {
  let db: Database;
  let service: PartyService;
  const adminId = 1;

  beforeEach(async () => {
    // Create a fresh database for each test
    db = new Database(':memory:');
    await runMigrations(db);
    service = new PartyService(db);

    // Create a test admin
    db.run(
      'INSERT INTO admin_users (id, username, password_hash) VALUES (?, ?, ?)',
      [adminId, 'admin', 'test-hash']
    );
  });

  describe('Party creation', () => {
    it('should create a planned party', () => {
      const party = service.create(
        {
          name: 'Test Party',
          startsAt: '2024-01-01T10:00:00Z',
          endsAt: '2024-01-01T18:00:00Z',
          description: 'A test party',
          location: 'Test Location',
        },
        adminId
      );

      expect(party).toBeDefined();
      expect(party.id).toBeNumber();
      expect(party.name).toBe('Test Party');
      expect(party.status).toBe('planned');
    });

    it('should create party without optional fields', () => {
      const party = service.create(
        {
          name: 'Minimal Party',
          startsAt: '2024-02-01T10:00:00Z',
          endsAt: '2024-02-01T18:00:00Z',
        },
        adminId
      );

      expect(party.description).toBeNull();
      expect(party.location).toBeNull();
    });
  });

  describe('Party lifecycle', () => {
    it('should activate a planned party', () => {
      const party = service.create(
        {
          name: 'Lifecycle Party',
          startsAt: '2024-03-01T10:00:00Z',
          endsAt: '2024-03-01T18:00:00Z',
        },
        adminId
      );

      const activated = service.activate(party.id, adminId);
      expect(activated.status).toBe('active');
    });

    it('should not activate an already active party', () => {
      const party = service.create(
        {
          name: 'Active Party',
          startsAt: '2024-03-01T10:00:00Z',
          endsAt: '2024-03-01T18:00:00Z',
        },
        adminId
      );

      service.activate(party.id, adminId);
      expect(() => service.activate(party.id, adminId)).toThrow('ACTIVE_PARTY_EXISTS');
    });

    it('should finish an active party', () => {
      const party = service.create(
        {
          name: 'To Finish',
          startsAt: '2024-03-01T10:00:00Z',
          endsAt: '2024-03-01T18:00:00Z',
        },
        adminId
      );

      service.activate(party.id, adminId);
      const finished = service.finish(party.id, adminId);
      expect(finished.status).toBe('finished');
    });

    it('should not finish a non-active party', () => {
      const party = service.create(
        {
          name: 'Planned Party',
          startsAt: '2024-03-01T10:00:00Z',
          endsAt: '2024-03-01T18:00:00Z',
        },
        adminId
      );

      expect(() => service.finish(party.id, adminId)).toThrow('INVALID_STATUS_TRANSITION');
    });

    it('should archive a finished party', () => {
      const party = service.create(
        {
          name: 'To Archive',
          startsAt: '2024-03-01T10:00:00Z',
          endsAt: '2024-03-01T18:00:00Z',
        },
        adminId
      );

      service.activate(party.id, adminId);
      service.finish(party.id, adminId);
      const archived = service.archive(party.id, adminId);
      expect(archived.status).toBe('archived');
    });

    it('should not archive a non-finished party', () => {
      const party = service.create(
        {
          name: 'Not Finished',
          startsAt: '2024-03-01T10:00:00Z',
          endsAt: '2024-03-01T18:00:00Z',
        },
        adminId
      );

      expect(() => service.archive(party.id, adminId)).toThrow('INVALID_STATUS_TRANSITION');
    });
  });

  describe('Active party enforcement', () => {
    it('should allow only one active party', () => {
      const party1 = service.create(
        {
          name: 'Party 1',
          startsAt: '2024-04-01T10:00:00Z',
          endsAt: '2024-04-01T18:00:00Z',
        },
        adminId
      );
      const party2 = service.create(
        {
          name: 'Party 2',
          startsAt: '2024-05-01T10:00:00Z',
          endsAt: '2024-05-01T18:00:00Z',
        },
        adminId
      );

      service.activate(party1.id, adminId);
      expect(() => service.activate(party2.id, adminId)).toThrow('ACTIVE_PARTY_EXISTS');
    });

    it('should return active party', () => {
      const party = service.create(
        {
          name: 'Active Party',
          startsAt: '2024-06-01T10:00:00Z',
          endsAt: '2024-06-01T18:00:00Z',
        },
        adminId
      );

      service.activate(party.id, adminId);
      const active = service.getActive();
      expect(active).toBeDefined();
      expect(active?.id).toBe(party.id);
    });

    it('should return null when no active party', () => {
      const active = service.getActive();
      expect(active).toBeNull();
    });
  });

  describe('Party updates', () => {
    it('should update a planned party', () => {
      const party = service.create(
        {
          name: 'Original Name',
          startsAt: '2024-07-01T10:00:00Z',
          endsAt: '2024-07-01T18:00:00Z',
        },
        adminId
      );

      const updated = service.update(
        party.id,
        { name: 'Updated Name', description: 'Updated description' },
        adminId
      );

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated description');
    });

    it('should not update a finished party', () => {
      const party = service.create(
        {
          name: 'To Finish',
          startsAt: '2024-08-01T10:00:00Z',
          endsAt: '2024-08-01T18:00:00Z',
        },
        adminId
      );

      service.activate(party.id, adminId);
      service.finish(party.id, adminId);

      expect(() =>
        service.update(party.id, { name: 'New Name' }, adminId)
      ).toThrow('PARTY_FINALIZED');
    });

    it('should not update a non-existent party', () => {
      expect(() =>
        service.update(99999, { name: 'New Name' }, adminId)
      ).toThrow('PARTY_NOT_FOUND');
    });
  });

  describe('Party queries', () => {
    it('should get party by id', () => {
      const party = service.create(
        {
          name: 'Query Party',
          startsAt: '2024-09-01T10:00:00Z',
          endsAt: '2024-09-01T18:00:00Z',
        },
        adminId
      );

      const found = service.getById(party.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(party.id);
    });

    it('should return null for non-existent party', () => {
      const found = service.getById(99999);
      expect(found).toBeNull();
    });

    it('should get all parties', () => {
      service.create(
        {
          name: 'Party A',
          startsAt: '2024-09-01T10:00:00Z',
          endsAt: '2024-09-01T18:00:00Z',
        },
        adminId
      );
      service.create(
        {
          name: 'Party B',
          startsAt: '2024-10-01T10:00:00Z',
          endsAt: '2024-10-01T18:00:00Z',
        },
        adminId
      );

      const parties = service.getAll();
      expect(parties).toBeArray();
      expect(parties.length).toBe(2);
    });

    it('should filter parties by status', () => {
      const party1 = service.create(
        {
          name: 'Party 1',
          startsAt: '2024-09-01T10:00:00Z',
          endsAt: '2024-09-01T18:00:00Z',
        },
        adminId
      );
      service.create(
        {
          name: 'Party 2',
          startsAt: '2024-10-01T10:00:00Z',
          endsAt: '2024-10-01T18:00:00Z',
        },
        adminId
      );

      service.activate(party1.id, adminId);

      const planned = service.getAll({ status: 'planned' });
      expect(planned.length).toBe(1);
      expect(planned[0].status).toBe('planned');

      const active = service.getAll({ status: 'active' });
      expect(active.length).toBe(1);
      expect(active[0].status).toBe('active');
    });
  });

  describe('Audit log', () => {
    it('should record party creation', () => {
      const party = service.create(
        {
          name: 'Audit Party',
          startsAt: '2024-10-01T10:00:00Z',
          endsAt: '2024-10-01T18:00:00Z',
        },
        adminId
      );

      const logs = service.getAuditLog({ targetType: 'party', targetId: party.id });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((l: any) => l.action === 'created')).toBeTrue();
    });

    it('should record status transitions', () => {
      const party = service.create(
        {
          name: 'Transition Party',
          startsAt: '2024-11-01T10:00:00Z',
          endsAt: '2024-11-01T18:00:00Z',
        },
        adminId
      );

      service.activate(party.id, adminId);
      service.finish(party.id, adminId);

      const logs = service.getAuditLog({ targetType: 'party', targetId: party.id });
      const actions = logs.map((l: any) => l.action);

      expect(actions).toContain('created');
      expect(actions).toContain('activated');
      expect(actions).toContain('finished');
    });

    it('should filter audit log by target', () => {
      const party1 = service.create(
        {
          name: 'Party A',
          startsAt: '2024-12-01T10:00:00Z',
          endsAt: '2024-12-01T18:00:00Z',
        },
        adminId
      );
      const party2 = service.create(
        {
          name: 'Party B',
          startsAt: '2025-01-01T10:00:00Z',
          endsAt: '2025-01-01T18:00:00Z',
        },
        adminId
      );

      const logs1 = service.getAuditLog({ targetType: 'party', targetId: party1.id });
      const logs2 = service.getAuditLog({ targetType: 'party', targetId: party2.id });

      expect(logs1.every((l: any) => l.targetId === party1.id)).toBeTrue();
      expect(logs2.every((l: any) => l.targetId === party2.id)).toBeTrue();
    });
  });
});
