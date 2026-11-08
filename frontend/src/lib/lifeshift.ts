import type { Option, Profile } from "../data/types";

export type LifeInputs = {
  incomePct: number;
  extraExpenses: number;
  dailyMiles: number;
  budget: number;
};

export type Scenario = {
  id: "keep" | "refi" | "smaller";
  title: string;
  payment: number | null;
  leftover: number | null;
  note: string;
  available: boolean;
};

const WORKDAYS = 240;

function eligiblePayment(options: Option[], id: string): number | null {
  const match = options.find((option) => option.option_id === id && option.eligibility === "Y" && option.new_monthly_payment != null);
  return match?.new_monthly_payment ?? null;
}

export function monthlyIncome(annual: number, incomePct: number) {
  return (annual / 12) * (1 + incomePct / 100);
}

export function simulate(profile: Profile, input: LifeInputs): { income: number; milesNow: number; scenarios: Scenario[]; tradeIn: number; equity: number | null } {
  const income = monthlyIncome(profile.customer.annual_income, input.incomePct);
  const debt = profile.customer.other_monthly_debt;
  const current = profile.account.monthly_payment;
  const leftover = (payment: number) => income - debt - input.extraExpenses - payment;
  const refi = eligiblePayment(profile.options, "REFI");
  const extended = eligiblePayment(profile.options, "EXTEND");
  const smallerPayment = extended != null && extended <= input.budget ? extended : input.budget < current ? input.budget : null;
  const milesNow = Math.round(input.dailyMiles * 2 * WORKDAYS);

  return {
    income,
    milesNow,
    tradeIn: profile.vehicle.est_market_value_now,
    equity: profile.account.est_equity,
    scenarios: [
      {
        id: "keep",
        title: "Keep your vehicle",
        payment: current,
        leftover: leftover(current),
        note: "No change to the contract you already have.",
        available: true,
      },
      {
        id: "refi",
        title: "Explore refinancing",
        payment: refi,
        leftover: refi == null ? null : leftover(refi),
        note: refi == null ? "Refinance is not eligible on this agreement." : "This payment is already calculated for your contract. Approval is still required.",
        available: refi != null,
      },
      {
        id: "smaller",
        title: "Explore a less expensive Toyota",
        payment: smallerPayment,
        leftover: smallerPayment == null ? null : leftover(smallerPayment),
        note:
          extended != null && smallerPayment === extended
            ? "Uses the eligible longer term already on your agreement. A different vehicle still needs a real valuation."
            : "Illustrative budget only. It is not a financing quote or a trade-in offer.",
        available: smallerPayment != null,
      },
    ],
  };
}

export const lifeEvents: { id: string; label: string; patch: Partial<LifeInputs> }[] = [
  { id: "grad", label: "I just graduated", patch: { incomePct: 20, extraExpenses: 200, dailyMiles: 15 } },
  { id: "job", label: "I lost my job", patch: { incomePct: -40, extraExpenses: 0 } },
  { id: "married", label: "I'm getting married", patch: { incomePct: 10, extraExpenses: 300 } },
  { id: "child", label: "I'm having a child", patch: { extraExpenses: 400 } },
  { id: "move", label: "I'm moving", patch: { extraExpenses: 250, dailyMiles: 20 } },
  { id: "commute", label: "My commute got longer", patch: { dailyMiles: 50 } },
  { id: "bonus", label: "I received a bonus", patch: { incomePct: 8, extraExpenses: 0 } },
  { id: "cut", label: "My income fell 20%", patch: { incomePct: -20 } },
];
