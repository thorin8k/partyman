import { describe, expect, it } from "bun:test";
import { generateBracket, getNextMatchPosition, isBye } from "../src/backend/tournaments/single-elimination";

describe("single-elimination bracket", () => {
  it("generates correct bracket for 2 participants", () => {
    const matches = generateBracket([1, 2]);
    expect(matches.length).toBe(1);
    expect(matches[0].round).toBe(1);
    expect(matches[0].participantAId).toBe(1);
    expect(matches[0].participantBId).toBe(2);
  });

  it("generates correct bracket for 4 participants", () => {
    const matches = generateBracket([1, 2, 3, 4]);
    expect(matches.length).toBe(3);
    expect(matches.filter(m => m.round === 1).length).toBe(2);
    expect(matches.filter(m => m.round === 2).length).toBe(1);
  });

  it("handles byes for 3 participants", () => {
    const matches = generateBracket([1, 2, 3]);
    expect(matches.length).toBe(3);
    const byes = matches.filter(m => isBye(m));
    expect(byes.length).toBe(1);
    expect(byes[0].participantAId).toBe(3);
    expect(byes[0].participantBId).toBeNull();
  });

  it("handles byes for 5 participants", () => {
    const matches = generateBracket([1, 2, 3, 4, 5]);
    expect(matches.length).toBe(7);
    const byes = matches.filter(m => isBye(m));
    expect(byes.length).toBe(1);
    expect(byes[0].participantAId).toBe(3);
    expect(byes[0].participantBId).toBeNull();
  });

  it("generates correct bracket for 8 participants (no byes)", () => {
    const matches = generateBracket([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(matches.length).toBe(7);
    expect(matches.filter(m => isBye(m)).length).toBe(0);
    expect(matches.filter(m => m.round === 1).length).toBe(4);
    expect(matches.filter(m => m.round === 2).length).toBe(2);
    expect(matches.filter(m => m.round === 3).length).toBe(1);
  });

  it("handles 16 participants", () => {
    const matches = generateBracket([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(matches.length).toBe(15);
    expect(matches.filter(m => isBye(m)).length).toBe(0);
  });

  it("returns empty for less than 2 participants", () => {
    expect(generateBracket([]).length).toBe(0);
    expect(generateBracket([1]).length).toBe(0);
  });

  it("getNextMatchPosition computes correctly", () => {
    expect(getNextMatchPosition(1, 0)).toEqual({ round: 2, position: 0 });
    expect(getNextMatchPosition(1, 1)).toEqual({ round: 2, position: 0 });
    expect(getNextMatchPosition(1, 2)).toEqual({ round: 2, position: 1 });
    expect(getNextMatchPosition(2, 0)).toEqual({ round: 3, position: 0 });
  });
});
