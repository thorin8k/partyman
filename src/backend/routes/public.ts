import type { Database } from "bun:sqlite";
import { getLeaderboard } from "../scoring/service";
import { sweepDueReports } from "./tournaments";
import { accessPassword, accessPasswordRequired } from "../auth/access";

export function createPublicRoutes(db: Database, opts?: { publicOrigin?: string }) {
  // URL canónica para el QR de unión: la que abre el móvil, no la del navegador
  // que muestra el display (proyector suele abrir por localhost).
  const joinUrl = (opts?.publicOrigin ?? process.env.PUBLIC_ORIGIN ?? "").replace(/\/$/, "") || null;
  // El QR del display lleva la clave de acceso embebida: quien está en la party
  // y escanea, entra ya dentro (solo si hay puerta configurada).
  const qrUrl = joinUrl && accessPasswordRequired()
    ? `${joinUrl}/?access=${encodeURIComponent(accessPassword())}`
    : joinUrl;
  return {
    "/api/public/state": {
      GET: handleGetPublicState,
    },
    "/api/planning": {
      GET: handleGetPlanning,
    },
  };

  function handleGetPublicState(): Response {
    try { sweepDueReports(db); } catch { /* display polling drives timeouts; never break it */ }
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
          .query<{ id: number; title: string; game_title_snapshot: string | null; starts_at: string; ends_at: string; capacity: number | null; notes: string | null; status: string; game_id: number | null }, [number]>(
            "SELECT id, title, game_title_snapshot, starts_at, ends_at, capacity, notes, status, game_id FROM activities WHERE party_id = ? AND status != 'cancelled' ORDER BY starts_at"
          )
          .all(party.id)
          .map((r) => {
            const participants = db.query<{ id: number; display_name: string }, [number]>("SELECT p.id, p.display_name FROM activity_participants ap JOIN participants p ON p.id = ap.participant_id WHERE ap.activity_id = ?").all(r.id).map(p => ({ id: p.id, displayName: p.display_name }));
            const count = db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM activity_participants WHERE activity_id = ?").get(r.id)!;
            const gameImage = r.game_id ? db.query<{ image_url: string | null }, [number]>("SELECT image_url FROM games WHERE id = ?").get(r.game_id)?.image_url ?? null : null;
            return {
              id: r.id,
              title: r.title,
              gameTitle: r.game_title_snapshot,
              gameImage,
              startsAt: r.starts_at,
              endsAt: r.ends_at,
              capacity: r.capacity,
              notes: r.notes,
              status: r.status,
              participantCount: count.count,
              participants,
            };
          })
      : [];

    const tournaments = party
      ? db
          .query<{ id: number; name: string; game_title_snapshot: string; game_id: number; status: string; max_participants: number }, [number]>(
            "SELECT id, name, game_title_snapshot, game_id, status, max_participants FROM tournaments WHERE party_id = ? AND status IN ('upcoming', 'in_progress') ORDER BY name"
          )
          .all(party.id)
          .map((r) => {
            const gameImage = db.query<{ image_url: string | null }, [number]>("SELECT image_url FROM games WHERE id = ?").get(r.game_id)?.image_url ?? null;
            const matches = r.status === 'in_progress'
              ? db.query<{ id: number; round: number; position: number; participant_a_id: number | null; participant_b_id: number | null; winner_id: number | null; status: string }, [number]>(
                  "SELECT id, round, position, participant_a_id, participant_b_id, winner_id, status FROM matches WHERE tournament_id = ? ORDER BY round, position"
                ).all(r.id).map(m => {
                  const pA = m.participant_a_id ? db.query<{ display_name_snapshot: string }, [number, number]>("SELECT display_name_snapshot FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(r.id, m.participant_a_id)?.display_name_snapshot ?? null : null;
                  const pB = m.participant_b_id ? db.query<{ display_name_snapshot: string }, [number, number]>("SELECT display_name_snapshot FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(r.id, m.participant_b_id)?.display_name_snapshot ?? null : null;
                  const w = m.winner_id ? db.query<{ display_name_snapshot: string }, [number, number]>("SELECT display_name_snapshot FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(r.id, m.winner_id)?.display_name_snapshot ?? null : null;
                  return { id: m.id, round: m.round, position: m.position, participantAId: m.participant_a_id, participantBId: m.participant_b_id, participantA: pA, participantB: pB, winner: w, winnerId: m.winner_id, status: m.status };
                })
              : [];
            return {
              id: r.id,
              name: r.name,
              gameTitle: r.game_title_snapshot,
              gameImage,
              status: r.status,
              maxParticipants: r.max_participants,
              matches,
            };
          })
      : [];

    const recentTournaments = party
      ? db
          .query<{ id: number; name: string; game_title_snapshot: string; winner_id: number | null }, [number]>(
            "SELECT t.id, t.name, t.game_title_snapshot, (SELECT winner_id FROM matches WHERE tournament_id = t.id AND round = (SELECT MAX(round) FROM matches WHERE tournament_id = t.id) LIMIT 1) AS winner_id FROM tournaments t WHERE t.party_id = ? AND t.status = 'finished' ORDER BY t.updated_at DESC LIMIT 3"
          )
          .all(party.id)
          .map(r => {
            const winner = r.winner_id ? db.query<{ display_name_snapshot: string }, [number, number]>("SELECT display_name_snapshot FROM tournament_participants WHERE tournament_id = ? AND participant_id = ?").get(r.id, r.winner_id)?.display_name_snapshot ?? null : null;
            return { id: r.id, name: r.name, gameTitle: r.game_title_snapshot, winner };
          })
      : [];
    // ponytail: leaderboard público reutiliza scoring; si el dominio no existe aún, array vacío (spec 004).
    let leaderboard: Array<{ participantId: number; displayName: string; avatarUrl: string | null; points: number; wins: number }> = [];
    if (party) {
      try { leaderboard = getLeaderboard(db, party.id).slice(0, 10); } catch { leaderboard = []; }
    }
    let activity: unknown[] = [];
    try {
      activity = db.query<{ id: number; message: string; event_type: string; created_at: string }, [number]>(
        "SELECT id, message, event_type, created_at FROM activity_events WHERE party_id = ? ORDER BY id DESC LIMIT 20"
      ).all(party?.id ?? -1).map(r => ({ id: r.id, message: r.message, eventType: r.event_type, createdAt: r.created_at }));
    } catch { activity = []; }

    // WiFi de la party para el QR: LAN privada, SSID + password en el estado público (sin auth).
    const wifiSsid = process.env.WIFI_SSID ?? null;
    return Response.json({
      party: party
        ? { id: party.id, name: party.name, startsAt: party.starts_at, endsAt: party.ends_at, status: party.status }
        : null,
      attendees,
      activities,
      tournaments,
      recentTournaments,
      leaderboard,
      activity,
      wifi: wifiSsid ? { ssid: wifiSsid, password: process.env.WIFI_PASSWORD ?? null } : null,
      joinUrl,
      qrUrl,
      generatedAt: new Date().toISOString(),
    });
  }

  function handleGetPlanning(): Response {
    const party = db
      .query<{ id: number; name: string; starts_at: string; ends_at: string; status: string }, []>(
        "SELECT id, name, starts_at, ends_at, status FROM parties WHERE status = 'active' LIMIT 1"
      )
      .get();

    if (!party) return Response.json({ party: null, activities: [] });

    const activities = db
      .query<{ id: number; title: string; game_title_snapshot: string | null; starts_at: string; ends_at: string; capacity: number | null; notes: string | null; status: string; game_id: number | null }, [number]>(
        "SELECT id, title, game_title_snapshot, starts_at, ends_at, capacity, notes, status, game_id FROM activities WHERE party_id = ? AND status != 'cancelled' ORDER BY starts_at"
      )
      .all(party.id)
      .map((r) => {
        const participants = db
          .query<{ id: number; display_name: string }, [number]>(
            "SELECT p.id, p.display_name FROM activity_participants ap JOIN participants p ON p.id = ap.participant_id WHERE ap.activity_id = ?"
          )
          .all(r.id)
          .map(p => ({ id: p.id, displayName: p.display_name }));
        const count = db.query<{ count: number }, [number]>("SELECT COUNT(*) AS count FROM activity_participants WHERE activity_id = ?").get(r.id)!;
        const gameImage = r.game_id ? db.query<{ image_url: string | null }, [number]>("SELECT image_url FROM games WHERE id = ?").get(r.game_id)?.image_url ?? null : null;
        return {
          id: r.id,
          title: r.title,
          gameTitle: r.game_title_snapshot,
          gameImage,
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          capacity: r.capacity,
          notes: r.notes,
          status: r.status,
          participantCount: count.count,
          participants,
        };
      });

    console.log("[public] GET /api/planning →", activities.length, "activities");
    return Response.json({ party: { id: party.id, name: party.name }, activities });
  }
}
