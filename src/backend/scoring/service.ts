import type { Database } from "bun:sqlite";

export function seedPointRules(db: Database) {
  db.run("INSERT OR IGNORE INTO point_rules (code, label, points) VALUES ('party_participation', 'Participación en party', 1)");
  db.run("INSERT OR IGNORE INTO point_rules (code, label, points) VALUES ('activity_participation', 'Participación en actividad', 1)");
  db.run("INSERT OR IGNORE INTO point_rules (code, label, points) VALUES ('tournament_participation', 'Participación en torneo', 2)");
  db.run("INSERT OR IGNORE INTO point_rules (code, label, points) VALUES ('tournament_win', 'Victoria en torneo', 10)");
  db.run("INSERT OR IGNORE INTO point_rules (code, label, points) VALUES ('tournament_runner_up', 'Subcampeón', 5)");
}

// Task 014: thresholds are code constants until a real party proves otherwise.
export const AUTO_APPROVE_VOTES = 3;
export const REPORT_TIMEOUT_MIN = 15;

const AUTO_ACHIEVEMENTS: Array<[string, string, string]> = [
  ["debut", "Debut", "Primera party"],
  ["first_win", "Primera victoria", "Primera victoria en torneo"],
  ["veteran_3_wins", "Veterano", "3 victorias en torneos"],
  ["regular_3_tournaments", "Habitual", "Jugar 3 torneos"],
  ["social_3_activities", "Sociable", "Unirse a 3 actividades de una party"],
  ["undefeated_party", "Invicto", "Ganar todos los torneos jugados de una party (mín. 2)"],
  ["party_mvp", "MVP", "Más puntos de la party"],
];

export function seedAchievements(db: Database) {
  for (const [code, name, desc] of AUTO_ACHIEVEMENTS) {
    db.run("INSERT OR IGNORE INTO achievements (code, name, description) VALUES (?, ?, ?)", [code, name, desc]);
  }
}

function achievementId(db: Database, code: string): number | null {
  return db.query<{ id: number }, [string]>("SELECT id FROM achievements WHERE code = ?").get(code)?.id ?? null;
}

// ponytail: exactly-once por (achievement, party, participant); el título es el nombre del logro.
function awardAuto(db: Database, participantId: number, code: string, partyId: number | null, note: string) {
  const achId = achievementId(db, code);
  if (!achId) return;
  const exists = db.query<{ n: number }, [number, number, number | null, number | null]>(
    "SELECT COUNT(*) AS n FROM participant_awards WHERE participant_id = ? AND achievement_id = ? AND ((party_id IS NULL AND ? IS NULL) OR party_id = ?)"
  ).get(participantId, achId, partyId, partyId);
  if (exists && exists.n > 0) return;
  const name = db.query<{ name: string }, [number]>("SELECT name FROM achievements WHERE id = ?").get(achId)!.name;
  db.run("INSERT INTO participant_awards (participant_id, achievement_id, party_id, title, note) VALUES (?, ?, ?, ?, ?)",
    [participantId, achId, partyId, name, note]);
}

export function logEvent(db: Database, partyId: number, participantId: number | null, eventType: string, message: string) {
  try {
    (db as any).run("INSERT INTO activity_events (party_id, participant_id, event_type, message) VALUES (?, ?, ?, ?)",
      [partyId, participantId, eventType, message]);
  } catch { /* events never block scoring */ }
}

// ponytail: unirse es la participación; salir nunca resta (ledger inmutable, idempotente).
export function awardActivityJoin(db: Database, activityId: number, partyId: number, participantId: number) {
  const rule = db.query<{ points: number }, [string]>("SELECT points FROM point_rules WHERE code = 'activity_participation' AND enabled = 1").get("activity_participation");
  if (!rule) return;
  (db as any).run("INSERT OR IGNORE INTO point_ledger (participant_id, party_id, source_type, source_key, reason, points) VALUES (?, ?, 'activity', ?, 'activity_participation', ?)",
    [participantId, partyId, `activity:${activityId}:${participantId}`, rule.points]);
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

  // Task 014: participation for everyone listed at finish + tournament-scoped auto achievements.
  const partRule = db.query<{ points: number }, [string]>("SELECT points FROM point_rules WHERE code = 'tournament_participation' AND enabled = 1").get("tournament_participation");
  const listed = db.query<{ participant_id: number }, [number]>("SELECT participant_id FROM tournament_participants WHERE tournament_id = ?").all(tournamentId);
  if (partRule) {
    for (const p of listed) {
      (db as any).run("INSERT OR IGNORE INTO point_ledger (participant_id, party_id, source_type, source_key, reason, points) VALUES (?, ?, 'tournament', ?, 'tournament_participation', ?)",
        [p.participant_id, partyId, `${tournamentId}:${p.participant_id}`, partRule.points]);
    }
  }
  if (winner?.winner_id) {
    const wins = db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM point_ledger WHERE participant_id = ? AND reason = 'tournament_win' AND correction_of IS NULL").get(winner.winner_id)?.n ?? 0;
    if (wins === 1) { awardAuto(db, winner.winner_id, "first_win", partyId, `Primer torneo ganado: ${tournament.name}`); logEvent(db, partyId, winner.winner_id, "achievement", `Primera victoria en ${tournament.name}`); }
    if (wins === 3) { awardAuto(db, winner.winner_id, "veteran_3_wins", partyId, "3 victorias en torneos"); logEvent(db, partyId, winner.winner_id, "achievement", "3 victorias en torneos"); }
  }
  for (const p of listed) {
    const played = db.query<{ n: number }, [number]>(
      "SELECT COUNT(DISTINCT tp.tournament_id) AS n FROM tournament_participants tp JOIN tournaments t ON t.id = tp.tournament_id WHERE tp.participant_id = ? AND t.status = 'finished'"
    ).get(p.participant_id)?.n ?? 0;
    if (played === 3) { awardAuto(db, p.participant_id, "regular_3_tournaments", null, "3 torneos jugados"); logEvent(db, partyId, p.participant_id, "achievement", "3 torneos jugados"); }
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
      const ever = db.query<{ n: number }, [number]>("SELECT COUNT(*) AS n FROM point_ledger WHERE participant_id = ? AND reason = 'party_participation' AND correction_of IS NULL").get(m.participant_id)?.n ?? 0;
      if (ever === 1) { awardAuto(db, m.participant_id, "debut", partyId, "Primera party"); logEvent(db, partyId, m.participant_id, "achievement", "Debut en party"); }
      const social = db.query<{ n: number }, [number, number]>("SELECT COUNT(*) AS n FROM activity_participants ap JOIN activities a ON a.id = ap.activity_id WHERE ap.participant_id = ? AND a.party_id = ?").get(m.participant_id, partyId)?.n ?? 0;
      if (social >= 3) { awardAuto(db, m.participant_id, "social_3_activities", partyId, "3 actividades en una party"); logEvent(db, partyId, m.participant_id, "achievement", "Sociable: 3 actividades"); }
      const played = db.query<{ tournament_id: number }, [number, number]>("SELECT tp.tournament_id FROM tournament_participants tp JOIN tournaments t ON t.id = tp.tournament_id WHERE tp.participant_id = ? AND t.party_id = ? AND t.status = 'finished'").all(m.participant_id, partyId);
      if (played.length >= 2) {
        const won = db.query<{ n: number }, [number, number]>("SELECT COUNT(DISTINCT tournament_id) AS n FROM point_ledger WHERE participant_id = ? AND party_id = ? AND reason = 'tournament_win' AND correction_of IS NULL").get(m.participant_id, partyId)?.n ?? 0;
        if (won === played.length) { awardAuto(db, m.participant_id, "undefeated_party", partyId, "Invicto en la party"); logEvent(db, partyId, m.participant_id, "achievement", "Invicto en la party"); }
      }
    }
    // MVP: top of the party board (ties share it).
    try {
      const board = getLeaderboard(db, partyId);
      const top = board.length ? board[0].points : null;
      for (const b of board) {
        if (b.points === top && top !== null) { awardAuto(db, b.participantId, "party_mvp", partyId, "MVP de la party"); logEvent(db, partyId, b.participantId, "achievement", "MVP de la party"); }
      }
    } catch { /* board optional */ }
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
