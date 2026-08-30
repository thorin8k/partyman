import type { Database } from "bun:sqlite";

export function createPublicRoutes(db: Database) {
  return {
    "/api/public/state": {
      GET: handleGetPublicState,
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

    const tournaments: unknown[] = [];
    const leaderboard: unknown[] = [];
    const schedule: unknown[] = [];
    const activity: unknown[] = [];

    return Response.json({
      party: party
        ? { id: party.id, name: party.name, startsAt: party.starts_at, endsAt: party.ends_at, status: party.status }
        : null,
      attendees,
      schedule,
      tournaments,
      leaderboard,
      activity,
      generatedAt: new Date().toISOString(),
    });
  }
}
