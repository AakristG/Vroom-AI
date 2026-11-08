/** Deterministic loan math. Mirrors backend/apps/ai/finance.py so the page and the assistant agree. */

const rate = (apr: number) => apr / 100 / 12;

/** Payments on file are rounded to the cent; a leftover under $1 is settled with the final payment. */
const ROUNDING_RESIDUE = 1;

export function payment(principal: number, apr: number, months: number) {
  if (months <= 0) return 0;
  const r = rate(apr);
  return r === 0 ? principal / months : (principal * r) / (1 - (1 + r) ** -months);
}

export interface ScheduleRow {
  month: number;
  interest: number;
  principal: number;
  balance: number;
}

export function schedule(balance: number, apr: number, monthly: number, maxMonths = 600): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const r = rate(apr);
  let month = 0;
  while (balance > 0.005 && month < maxMonths) {
    month += 1;
    const interest = balance * r;
    let principal = Math.min(monthly - interest, balance);
    if (principal <= 0) break;
    if (balance - principal < ROUNDING_RESIDUE) principal = balance;
    balance -= principal;
    rows.push({ month, interest, principal, balance: Math.max(balance, 0) });
  }
  return rows;
}

export interface Scenario {
  monthly: number;
  months: number;
  totalInterest: number;
  totalPaid: number;
}

export function scenario(balance: number, apr: number, months: number, extraPerMonth = 0): Scenario {
  const base = payment(balance, apr, months);
  const rows = schedule(balance, apr, base + extraPerMonth);
  const totalInterest = rows.reduce((s, r) => s + r.interest, 0);
  return { monthly: base + extraPerMonth, months: rows.length, totalInterest, totalPaid: balance + totalInterest };
}

export interface SimulationInput {
  balance: number;
  apr: number;
  /** Contractual monthly payment on file. */
  monthly: number;
  extraMonthly?: number;
  /** One-time principal payment applied before the next scheduled payment. */
  lumpSum?: number;
}

export interface Simulation {
  /** False when the payment does not cover the first month's interest, so the loan never pays off. */
  valid: boolean;
  monthly: number;
  lumpSum: number;
  months: number;
  totalInterest: number;
  rows: ScheduleRow[];
}

const finite = (n: number | undefined, fallback = 0) => (typeof n === "number" && Number.isFinite(n) ? n : fallback);

/** Payoff of the current balance with optional extra monthly principal and a one-time principal payment. */
export function simulate(input: SimulationInput): Simulation {
  const balance = Math.max(finite(input.balance), 0);
  const apr = Math.max(finite(input.apr), 0);
  const extra = Math.max(finite(input.extraMonthly), 0);
  const lumpSum = Math.min(Math.max(finite(input.lumpSum), 0), balance);
  const monthly = Math.max(finite(input.monthly), 0) + extra;
  const start = balance - lumpSum;

  if (start <= 0.005) return { valid: true, monthly, lumpSum, months: 0, totalInterest: 0, rows: [] };
  if (monthly <= start * rate(apr)) return { valid: false, monthly, lumpSum, months: 0, totalInterest: 0, rows: [] };

  const rows = schedule(start, apr, monthly);
  const paidOff = rows.length > 0 && rows[rows.length - 1].balance <= 0.005;
  return { valid: paidOff, monthly, lumpSum, months: rows.length, totalInterest: rows.reduce((s, r) => s + r.interest, 0), rows };
}

/** Yearly principal/interest totals for charting. */
export function byYear(rows: ScheduleRow[]) {
  const out: { label: string; principal: number; interest: number; balance: number }[] = [];
  rows.forEach((row, i) => {
    const y = Math.floor(i / 12);
    if (!out[y]) out[y] = { label: `Year ${y + 1}`, principal: 0, interest: 0, balance: 0 };
    out[y].principal += row.principal;
    out[y].interest += row.interest;
    out[y].balance = row.balance;
  });
  return out;
}

/** Next calendar date on the payment due day, from today. */
export function nextDueDate(dueDay: number, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), dueDay);
  if (d <= from) d.setMonth(d.getMonth() + 1);
  return d;
}

export function addMonths(date: Date, n: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
