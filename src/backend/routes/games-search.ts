import type { Database } from "bun:sqlite";
import { requireParticipant } from "../auth/guards";

const STEAMGRIDDB_API = "https://www.steamgriddb.com/api/v2";

export function createGamesSearchRoutes(db: Database) {
  return {
    "/api/games/search": {
      GET: handleSearchGames,
    },
  };

  async function handleSearchGames(request: Request): Promise<Response> {
    // La búsqueda consume la API key de SteamGridDB: solo sesiones autenticadas.
    const auth = requireParticipant(db, request);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const query = url.searchParams.get("q");
    if (!query || query.trim().length === 0) {
      return Response.json({ games: [] });
    }

    const apiKey = process.env.STEAMGRIDDB_API_KEY;
    if (!apiKey) {
      console.log("[games-search] No STEAMGRIDDB_API_KEY configured");
      return Response.json({ games: [], warning: "SteamGridDB API key not configured" });
    }

    try {
      const res = await fetch(`${STEAMGRIDDB_API}/search/autocomplete/${encodeURIComponent(query.trim())}`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        console.log("[games-search] SteamGridDB API error:", res.status);
        return Response.json({ games: [] });
      }

      const data = await res.json() as { data: Array<{ id: number; name: string; types: string[] }> };
      const rawGames = (data.data || []).slice(0, 8);

      const games = await Promise.all(rawGames.map(async (g) => {
        try {
          const gridRes = await fetch(`${STEAMGRIDDB_API}/grids/game/${g.id}?dimensions=600x900,460x215&types=static&limit=1`, {
            headers: { "Authorization": `Bearer ${apiKey}` },
          });
          if (gridRes.ok) {
            const gridData = await gridRes.json() as { data: Array<{ thumb: string; url: string }> };
            const thumb = gridData.data?.[0]?.thumb || gridData.data?.[0]?.url || null;
            return { id: g.id, name: g.name, imageUrl: thumb, types: g.types || [] };
          }
        } catch {}
        return { id: g.id, name: g.name, imageUrl: null, types: g.types || [] };
      }));

      console.log("[games-search] Found", games.length, "games for query:", query);
      return Response.json({ games });
    } catch (err) {
      console.log("[games-search] Error:", err);
      return Response.json({ games: [], error: "Search failed" });
    }
  }
}
