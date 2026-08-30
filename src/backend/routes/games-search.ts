import type { Database } from "bun:sqlite";

const STEAMGRIDDB_API = "https://www.steamgriddb.com/api/v2";

export function createGamesSearchRoutes(db: Database) {
  return {
    "/api/games/search": {
      GET: handleSearchGames,
    },
  };

  async function handleSearchGames(request: Request): Promise<Response> {
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

      const data = await res.json() as { data: Array<{ id: number; name: string; types: string[]; release_date: string; avatar: { thumb: string; small: string; medium: string; large: string; } }> };

      const games = (data.data || []).slice(0, 10).map(g => ({
        id: g.id,
        name: g.name,
        imageUrl: g.avatar?.thumb || g.avatar?.small || null,
        types: g.types || [],
      }));

      console.log("[games-search] Found", games.length, "games for query:", query);
      return Response.json({ games });
    } catch (err) {
      console.log("[games-search] Error:", err);
      return Response.json({ games: [], error: "Search failed" });
    }
  }
}
