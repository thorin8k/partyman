import { randomUUID } from "node:crypto";

interface SteamConfig {
  realm: string;
  returnTo: string;
  apiKey: string | null;
}

interface SteamCallbackResult {
  steamId: string;
}

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";

export function buildSteamRedirectUrl(config: SteamConfig, state: string): string {
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.return_to": config.returnTo,
    "openid.realm": config.realm,
    "openid.state": state,
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

export function createSteamState(): string {
  return randomUUID();
}

async function realVerifySteamCallback(params: URLSearchParams): Promise<SteamCallbackResult> {
  if (params.get("openid.mode") !== "id_res") {
    throw new Error("Invalid OpenID mode");
  }
  const returnTo = params.get("openid.return_to");
  if (!returnTo) throw new Error("Missing return_to");

  const checkParams = new URLSearchParams(params.toString());
  checkParams.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: checkParams.toString(),
  });
  const body = await response.text();
  if (!/^is_valid\s*:?\s*true/m.test(body)) {
    throw new Error("Steam validation failed");
  }

  const claimedId = params.get("openid.claimed_id");
  if (!claimedId) throw new Error("Missing claimed_id");
  const match = claimedId.match(/\/(\d+)$/);
  if (!match) throw new Error("Invalid claimed_id");
  return { steamId: match[1] };
}

interface SteamProfile {
  nickname: string;
  avatarUrl: string | null;
}

export async function fetchSteamProfile(apiKey: string | null, steamId: string): Promise<SteamProfile> {
  if (!apiKey) {
    return { nickname: `Participant #${steamId.slice(-4)}`, avatarUrl: null };
  }
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`
    );
    const data = await res.json() as { response: { players: Array<{ personaname: string; avatarfull: string }> } };
    const player = data.response.players[0];
    if (!player) return { nickname: `Participant #${steamId.slice(-4)}`, avatarUrl: null };
    return {
      nickname: player.personaname || `Participant #${steamId.slice(-4)}`,
      avatarUrl: player.avatarfull || null,
    };
  } catch {
    return { nickname: `Participant #${steamId.slice(-4)}`, avatarUrl: null };
  }
}

type SteamVerifier = (params: URLSearchParams) => Promise<SteamCallbackResult>;

let verifier: SteamVerifier = realVerifySteamCallback;

export function setSteamVerifier(next: SteamVerifier): void {
  verifier = next;
}

export function verifySteamCallback(params: URLSearchParams): Promise<SteamCallbackResult> {
  return verifier(params);
}

