import type { Database } from "bun:sqlite";

export function seedPointRules(db: Database) {
  db.run("INSERT OR IGNORE INTO point_rules (code, label, points) VALUES ('party_participation', 'Participación en party', 1)");
  db.run("INSERT OR IGNORE INTO point_rules (code, label, points) VALUES ('tournament_win', 'Victoria en torneo', 10)");
  db.run("INSERT OR IGNORE INTO point_rules (code, label, points) VALUES ('tournament_runner_up', 'Subcampeón', 5)");
}

export function scoreTournamentFinished(db: Database, tournamentId: number, partyId: number) {
  const tournament = db.query<{ id: number; name: string }, [number]>("SELECT id, name FROM tournaments WHERE id = ?").get(tournamentId);
  if (!tournament) return;

  const winner = db.query<{ winner_id: number }, [number, number]>("SELECT winner_id FROM matches WHERE tournament_id = ? AND round = (SELECT MAX(round) FROM matches WHERE tournament_id = ?) LIMIT 1").get(tournamentId, tournamentId);
  if (!winner?.winner_id) return;

  const runnerUp = db.query<{ participant_a_id: number | null; participant_b_id: number | null; winner_id: number | null }, [number, number]>(
    "SELECT participant_a_id, participant_b_id, winner_id FROM matches WHERE tournament_id = ? AND round = (SELECT MAX(round) FROM matches WHERE tournament_id = ?) LIMIT 1"
  ).get(tournamentId, tournamentId);
  const loserId = runnerUp ? (runnerUp.winner_id === runnerUp.participant_a_id ? runnerUp.participant_b_id : runnerUp.participant_a_id) : null;

  const winRule = db.query<{ points: number }, [string]>("SELECT points FROM point_rules WHERE code = 'tournament_win' AND enabled = 1").get("tournament_win");
  const runnerRule = db.query<{ points: number }, [string]>("SELECT points FROM point_rules WHERE code = 'tournament_runner_up' AND enabled = 1").get("tournament_runner_up");

  if (winRule && winner.winner_id) {
    (db as any).run("INSERT OR IGNORE INTO point_ledger (participant_id, party_id, source_type, source_key, reason, points) VALUES (?, ?, 'tournament', ?, 'tournament_win', ?)",
      [winner.winner_id, partyId, String(tournamentId), winRule.points]);
    (db as any).run("INSERT OR IGNORE INTO activity_events (party_id, participant_id, event_type, message, source_type, source_id) VALUES (?, ?, 'tournament_win', ?, 'tournament', ?)",
      [partyId, winner.winner_id, `Ganó torneo ${tournament.name}`, tournamentId]);
  }
  if (runnerRule && loserId) {
    (db as any).run("INSERT OR IGNORE INTO point_ledger (participant_id, party_id, source_type, source_key, reason, points) VALUES (?, ?, 'tournament', ?, 'tournament_runner_up', ?)",
      [loserId, partyId, String(tournamentId), runnerRule.points]);
  }
  console.log("[scoring] Tournament #" + tournamentId + " scored");
}

export function scorePartyParticipation(db: Database, partyId: number) {
  try {
    const members = db.query<{ participant_id: number }, [number]>("SELECT participant_id FROM party_memberships WHERE party_id = ?").all(partyId);
    const rule = db.query<{ points: number }, [string]>("SELECT points FROM point_rules WHERE code = 'party_participation' AND enabled = 1").get("party_participation");
    if (!rule) return;
    for (const m of members) {
      (db as any).run("INSERT OR IGNORE INTO point_ledger (participant_id, party_id, source_type, source_key, reason, points) VALUES (?, ?, 'party_membership', ?, 'party_participation', ?)",
        [m.participant_id, partyId, `membership:${partyId}:${m.participant_id}`, rule.points]);
    }
    (db as any).run("INSERT OR REPLACE INTO party_scoring_runs (party_id, status, updated_at) VALUES (?, 'completed', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))", [partyId]);
    console.log("[scoring] Party #" + partyId + " participation scored");
  } catch (e: any) {
    (db as any).run("INSERT OR REPLACE INTO party_scoring_runs (party_id, status, last_error, updated_at) VALUES (?, 'failed', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))", [partyId, String(e.message ?? e)]);
  }
}

export function getLeaderboard(db: Database, partyId?: number) {
  const rows = partyId
    ? db.query<{ participant_id: number; display_name: string; avatar_url: string | null; total_points: number; wins: number }, [number]>(
        `SELECT p.id as participant_id, p.display_name, p.avatar_url,
         COALESCE(SUM(pl.points),0) as total_points,
         COALESCE(SUM(CASE WHEN pl.reason='tournament_win' THEN 1 ELSE 0 END),0) as wins
         FROM participants p LEFT JOIN point_ledger pl ON pl.participant_id = p.id AND pl.party_id = ?
         GROUP BY p.id ORDER BY total_points DESC, wins DESC, p.display_name COLLATE NOCASE ASC, p.id ASC`
      ).all(partyId)
    : db.query<{ participant_id: number; display_name: string; avatar_url: string | null; total_points: number; wins: number }, []>(
        `SELECT p.id as participant_id, p.display_name, p.avatar_url,
         COALESCE(SUM(pl.points),0) as total_points,
         COALESCE(SUM(CASE WHEN pl.reason='tournament_win' THEN 1 ELSE 0 END),0) as wins
         FROM participants p LEFT JOIN point_ledger pl ON pl.participant_id = p.id
         GROUP BY p.id ORDER BY total_points DESC, wins DESC, p.display_name COLLATE NOCASE ASC, p.id ASC`
      ).all();
  return rows.map(r => ({ participantId: r.participant_id, displayName: r.display_name, avatarUrl: r.avatar_url, points: r.total_points, wins: r.wins }));
}
