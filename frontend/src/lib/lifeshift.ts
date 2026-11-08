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
  const current = profile.account.monthly_payment > 0 ? profile.account.monthly_payment : null;
  const leftover = (payment: number) => income - debt - input.extraExpenses - payment;
  const refi = eligiblePayment(profile.options, "REFI");
  const extended = eligiblePayment(profile.options, "EXTEND");
  const smallerPayment = extended != null && extended <= input.budget ? extended : current != null && input.budget < current ? input.budget : null;
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
        leftover: current == null ? null : leftover(current),
        note: current == null ? "No Toyota payment is on file yet." : profile.account.account_id ? "No change to the contract you already have." : "This is the payment you entered. Toyota does not have a contract on file for it yet.",
        available: current != null,
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
