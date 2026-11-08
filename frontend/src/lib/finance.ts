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
