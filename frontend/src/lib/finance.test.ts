import { describe, expect, it } from "vitest";
import { payment, schedule, simulate } from "./finance";

describe("payment", () => {
  it("splits a zero-interest loan evenly", () => {
    expect(payment(12_000, 0, 24)).toBe(500);
  });

  it("matches the standard amortization formula", () => {
    expect(payment(25_000, 6, 60)).toBeCloseTo(483.32, 2);
  });
});

describe("simulate", () => {
  const loan = { balance: 20_000, apr: 6.9, monthly: payment(20_000, 6.9, 48) };

  it("pays off on the contractual schedule with no extra", () => {
    const s = simulate(loan);
    expect(s.valid).toBe(true);
    expect(s.months).toBe(48);
    expect(s.rows[s.rows.length - 1].balance).toBe(0);
  });

  it("agrees with the shared schedule helper", () => {
    const rows = schedule(loan.balance, loan.apr, loan.monthly + 100);
    const s = simulate({ ...loan, extraMonthly: 100 });
    expect(s.months).toBe(rows.length);
    expect(s.totalInterest).toBeCloseTo(rows.reduce((t, r) => t + r.interest, 0), 6);
  });

  it("saves months and interest with an extra monthly payment", () => {
    const base = simulate(loan);
    const faster = simulate({ ...loan, extraMonthly: 100 });
    expect(faster.months).toBeLessThan(base.months);
    expect(faster.totalInterest).toBeLessThan(base.totalInterest);
    expect(faster.monthly).toBeCloseTo(loan.monthly + 100, 6);
  });

  it("applies a one-time principal payment before the schedule", () => {
    const s = simulate({ ...loan, lumpSum: 5_000 });
    expect(s.lumpSum).toBe(5_000);
    expect(s.months).toBeLessThan(48);
    expect(s.rows[0].balance).toBeLessThan(15_000);
  });

  it("caps a one-time payment at the balance", () => {
    const s = simulate({ ...loan, lumpSum: 50_000 });
    expect(s).toMatchObject({ valid: true, lumpSum: 20_000, months: 0, totalInterest: 0 });
  });

  it("handles zero-interest loans", () => {
    const s = simulate({ balance: 6_000, apr: 0, monthly: 500, extraMonthly: 100 });
    expect(s.months).toBe(10);
    expect(s.totalInterest).toBe(0);
  });

  it("flags a payment that never covers the interest", () => {
    const s = simulate({ balance: 20_000, apr: 12, monthly: 150 });
    expect(s.valid).toBe(false);
    expect(s.rows).toHaveLength(0);
  });

  it("treats invalid inputs safely", () => {
    const s = simulate({ balance: Number.NaN, apr: -3, monthly: Number.POSITIVE_INFINITY, extraMonthly: -50, lumpSum: -10 });
    expect(s).toMatchObject({ valid: true, months: 0, totalInterest: 0, lumpSum: 0 });
  });
});
