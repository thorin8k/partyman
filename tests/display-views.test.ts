import { describe, expect, it } from "bun:test";
import { contentKeys, planViews, ROTATE_MS, VIEW_KEYS } from "../src/frontend/components/displayViews";

const NOW = new Date("2026-01-01T12:00:00Z").getTime();
const iso = (s: string) => new Date(s).toISOString();

function state(overrides = {}) {
  return {
    tournaments: [{ id: 1 }],
    leaderboard: [{ id: 1 }],
    activities: [{ status: "scheduled", startsAt: iso("2026-01-01T14:00"), endsAt: iso("2026-01-01T16:00") }],
    recentTournaments: [{ id: 9 }],
    joinUrl: "http://lan:8400",
    qrUrl: "http://lan:8400/?access=X",
    ...overrides,
  };
}

describe("task 019 display rotativo", () => {
  it("schedules every view that has content, in the fixed key order", () => {
    const keys = contentKeys(state(), NOW);
    expect(keys).toEqual([...VIEW_KEYS]);

    // El orden no depende de cómo lleguen los datos: el plan es estable entre vueltas.
    const shuffled = contentKeys(state({ recentTournaments: [], activities: [] }), NOW);
    const expected = VIEW_KEYS.filter((k) => keys.includes(k) && shuffled.includes(k));
    expect(shuffled).toEqual([...expected]);
  });

  it("treats past, live and future activities as the 'actividad' view", () => {
    // En curso ahora mismo.
    const live = contentKeys(state({ activities: [{ status: "scheduled", startsAt: iso("2026-01-01T11:00"), endsAt: iso("2026-01-01T13:00") }] }), NOW);
    expect(live).toContain("actividad");

    // Acabada de terminar (margen de un tick): todavía ha de mostrarse.
    const justEnded = contentKeys(state({ activities: [{ status: "scheduled", startsAt: iso("2026-01-01T10:00"), endsAt: iso("2026-01-01T12:00:00") }] }), NOW);
    expect(justEnded).toContain("actividad");

    // Nada programado ni en curso: fuera.
    const none = contentKeys(state({ activities: [{ status: "finished", startsAt: iso("2026-01-01T09:00"), endsAt: iso("2026-01-01T10:00") }] }), NOW);
    expect(none).not.toContain("actividad");
  });

  it("empty state leaves nothing but the QR, and never a blank screen", () => {
    const keys = contentKeys(state({
      tournaments: [], leaderboard: [], activities: [], recentTournaments: [], joinUrl: null, qrUrl: null,
    }), NOW);
    expect(keys).toEqual([]);
    // AC: pantalla nunca en blanco.
    expect(planViews(null, keys)).toEqual(["qr"]);
  });

  it("forces a valid ?vista= and falls back to rotation for an invalid one", () => {
    expect(planViews("ranking", VIEW_KEYS)).toEqual(["ranking"]);
    // AC: clave inválida → rotación normal.
    expect(planViews("inventada", VIEW_KEYS)).toEqual([...VIEW_KEYS]);
    expect(planViews(null, VIEW_KEYS)).toEqual([...VIEW_KEYS]);
  });

  it("keeps the interval off when the plan has one view (no useless blinking)", () => {
    // Solo QR: no rotar. La UI gatea el intervalo con plan.length > 1.
    const keys = contentKeys(state({ tournaments: [], leaderboard: [], activities: [], recentTournaments: [], joinUrl: null, qrUrl: "http://x" }), NOW);
    expect(keys).toEqual(["qr"]);
    expect(planViews(null, keys)).toHaveLength(1);
  });

  it("rotates at a code constant, not per party", () => {
    expect(ROTATE_MS).toBe(15000);
  });
});