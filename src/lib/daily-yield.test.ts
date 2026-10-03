import { describe, expect, it } from "vitest";
import { computeAccruedYield, readDailyYieldRate } from "./daily-yield";

const DAY = 86_400_000;

describe("daily yield", () => {
  it("defaults to 10% per day", () => {
    expect(readDailyYieldRate({})).toBe(10);
  });
  it("adds 10 per day on a 100 balance", () => {
    expect(computeAccruedYield(100, 10, 0 + 1, 1 + DAY)).toBe(10);
    expect(computeAccruedYield(100, 10, 1, 1 + 3 * DAY)).toBe(30);
  });
  it("uses a custom rate", () => {
    expect(computeAccruedYield(100, 5, 1, 1 + 2 * DAY)).toBe(10);
  });
  it("adds nothing before a full day or with zero balance", () => {
    expect(computeAccruedYield(100, 10, 1, DAY - 10)).toBe(0);
    expect(computeAccruedYield(0, 10, 1, 1 + 5 * DAY)).toBe(0);
  });
});
