-- Retirada de la feature antigua de propuestas de juego (sustituida por
-- activity_proposals / tournament_proposals en 011_activity_tournament_proposals).
DROP TABLE IF EXISTS proposal_votes;
DROP TABLE IF EXISTS party_game_proposals;
