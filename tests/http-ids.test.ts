import { describe, expect, it } from "bun:test";
import { parsePositiveId, pathId } from "../src/backend/http/ids";

describe("parsePositiveId", () => {
  it("accepts positive decimals", () => {
    expect(parsePositiveId("1")).toBe(1);
    expect(parsePositiveId("12")).toBe(12);
  });

  it("rejects zero, negatives, junk and empty", () => {
    for (const bad of ["0", "-3", "12abc", "0x10", "1.5", "", " ", null, undefined]) {
      expect(parsePositiveId(bad)).toBeNull();
    }
  });
});

describe("pathId", () => {
  it("extracts strict ids", () => {
    expect(pathId("http://h/api/parties/12", "/api/parties/")).toBe(12);
    expect(pathId("http://h/api/parties/12abc", "/api/parties/")).toBeNull();
    expect(pathId("http://h/api/parties/0", "/api/parties/")).toBeNull();
  });
});
