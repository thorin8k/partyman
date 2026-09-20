import { describe, expect, it } from "bun:test";
import { nextMoment, eventIcon, eventLabel, type FeedEvent } from "../src/frontend/components/activityFeed";

const ev = (id: number, message = `e${id}`, eventType = "achievement"): FeedEvent => ({
  id, message, eventType, createdAt: "2026-01-01T00:00:00Z",
});

describe("activity feed moment", () => {
  it("does not toast on the first load", () => {
    const r = nextMoment(null, [ev(3), ev(2), ev(1)]);
    expect(r.seenId).toBe(3);
    expect(r.moment).toBeNull();
  });

  it("toasts the newest event only when a higher id arrives", () => {
    const r = nextMoment(3, [ev(4), ev(3), ev(2)]);
    expect(r.seenId).toBe(4);
    expect(r.moment?.id).toBe(4);
    expect(r.moment?.message).toBe("e4");
  });

  it("stays silent on repeated polls with no new events", () => {
    const r = nextMoment(4, [ev(4), ev(3)]);
    expect(r.seenId).toBe(4);
    expect(r.moment).toBeNull();
  });

  it("handles an empty feed without losing the ceiling", () => {
    const r = nextMoment(5, []);
    expect(r.seenId).toBe(5);
    expect(r.moment).toBeNull();
  });

  it("labels and icons by event type", () => {
    expect(eventLabel("achievement")).toBe("¡LOGRO DESBLOQUEADO!");
    expect(eventLabel("tournament_win")).toBe("¡TORNEO DECIDIDO!");
    expect(eventLabel("match_confirmed")).toBe("NOVEDAD");
    expect(eventIcon("achievement")).toBe("🏆");
    expect(eventIcon("tournament_win")).toBe("🥇");
    expect(eventIcon("otro")).toBe("•");
  });
});
