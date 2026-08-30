-- Task 003: Party lifecycle and audit log
-- The parties table was created in migration 002 with all required columns.
-- This migration adds the unique index for single-active-party enforcement
-- and the audit_log table for tracking admin actions.

CREATE UNIQUE INDEX IF NOT EXISTS one_active_party ON parties(status) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_participant_id INTEGER,
  actor_admin_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
