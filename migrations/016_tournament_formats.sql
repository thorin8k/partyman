-- 016: normalize the legacy tournaments.format vocabulary ('single_elimination'
-- was never used by any flow) and add format to tournament proposals.
UPDATE tournaments SET format = 'single' WHERE format = 'single_elimination';
ALTER TABLE tournament_proposals ADD COLUMN format TEXT NOT NULL DEFAULT 'single';
