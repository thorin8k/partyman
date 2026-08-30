-- Add role column to participants for Steam admin promotion
ALTER TABLE participants ADD COLUMN role TEXT NOT NULL DEFAULT 'participant' CHECK(role IN ('participant', 'admin'));
