import type { Database } from "bun:sqlite";

export function createPublicRoutes(db: Database) {
  return {
    "/api/public/state": {
      GET: handleGetPublicState,
    },
    "/api/planning": {
      GET: handleGetPlanning,
    },
  };

  function handleGetPublicState(): Response {
    const party = db
      .query<{ id: number; name: string; starts_at: string; ends_at: string; status: string }, []>(
        "SELECT id, name, starts_at, ends_at, status FROM parties WHERE status = 'active' LIMIT 1"
      )
      .get();

    const attendees = party
      ? db
          .query<{ id: number; display_name: string; avatar_url: string | null; joined_at: string }, [number]>(
            "SELECT p.id, p.display_name, p.avatar_url, pm.joined_at FROM party_memberships pm JOIN participants p ON p.id = pm.participant_id WHERE pm.party_id = ? ORDER BY pm.joined_at"
          )
          .all(party.id)
          .map((r) => ({ id: r.id, displayName: r.display_name, avatarUrl: r.avatar_url, joinedAt: r.joined_at }))
      : [];

    console.log("[public] GET /api/public/state →", party ? "party#" + party.id + ", " + attendees.length + " attendees" : "no active party");
    const activities = party
      ? db
          .query<{ id: number; title: string; game_title_snapshot: string | null; starts_at: string; ends_at: string; capacity: number | null; status: string }, [number]>(
            "SELECT id, title, game_title_snapshot, starts_at, ends_at, capacity, status FROM activities WHERE party_id = ? AND status != 'cancelled' ORDER BY starts_at"
          )
          .all(party.id)
          .map((r) => ({
            id: r.id,
            title: r.title,
            gameTitle: r.game_title_snapshot,
            startsAt: r.starts_at,
            endsAt: r.ends_at,
            capacity: r.capacity,
            status: r.status,
          }))
      : [];

    const tournaments: unknown[] = [];
    const leaderboard: unknown[] = [];
    const schedule: unknown[] = [];
    const activity: unknown[] = [];

    return Response.json({
      party: party
        ? { id: party.id, name: party.name, startsAt: party.starts_at, endsAt: party.ends_at, status: party.status }
        : null,
      attendees,
      activities,
      schedule,
      tournaments,
      leaderboard,
      activity,
      generatedAt: new Date().toISOString(),
    });
  }

  function handleGetPlanning(): Response {
    const party = db
      .query<{ id: number; name: string; starts_at: string; ends_at: string; status: string }, []>(
        "SELECT id, name, starts_at, ends_at, status FROM parties WHERE status = 'active' LIMIT 1"
      )
      .get();

    if (!party) return Response.json({ party: null, activities: [], proposals: [] });

    const activities = db
      .query<{ id: number; title: string; game_title_snapshot: string | null; starts_at: string; ends_at: string; capacity: number | null; status: string }, [number]>(
        "SELECT id, title, game_title_snapshot, starts_at, ends_at, capacity, status FROM activities WHERE party_id = ? AND status != 'cancelled' ORDER BY starts_at"
      )
      .all(party.id)
      .map((r) => ({
        id: r.id,
        title: r.title,
        gameTitle: r.game_title_snapshot,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
        capacity: r.capacity,
        status: r.status,
      }));

    const proposals = db
      .query<{ id: number; game_id: number; title: string; vote_count: number }, [number]>(
        "SELECT ppg.id, ppg.game_id, g.title, (SELECT COUNT(*) FROM proposal_votes pv WHERE pv.proposal_id = ppg.id) AS vote_count FROM party_game_proposals ppg JOIN games g ON g.id = ppg.game_id WHERE ppg.party_id = ? ORDER BY vote_count DESC"
      )
      .all(party.id)
      .map((r) => ({ id: r.id, gameId: r.game_id, gameTitle: r.title, voteCount: r.vote_count }));

    console.log("[public] GET /api/planning →", activities.length, "activities,", proposals.length, "proposals");
    return Response.json({ party: { id: party.id, name: party.name }, activities, proposals });
  }
}
