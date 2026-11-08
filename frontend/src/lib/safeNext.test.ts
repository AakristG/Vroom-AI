import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

describe("safeNext", () => {
  it("allows in-app paths", () => {
    expect(safeNext("/vehicles")).toBe("/vehicles");
    expect(safeNext("/insights?year=2026")).toBe("/insights?year=2026");
    expect(safeNext("/vehicles#top")).toBe("/vehicles#top");
  });

  it("rejects open redirects", () => {
    expect(safeNext("https://evil.example")).toBe("/financial-services");
    expect(safeNext("//evil.example")).toBe("/financial-services");
    expect(safeNext("/\\evil.example")).toBe("/financial-services");
    expect(safeNext(null)).toBe("/financial-services");
  });
});
