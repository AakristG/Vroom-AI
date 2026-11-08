import type { Profile } from "../data/types";

export type JourneyKind = "safety" | "payment" | "lease" | "compare" | "maintenance" | "steady";

export interface Journey {
  kind: JourneyKind;
  eyebrow: string;
  title: string;
  body: string;
  cta: { label: string; to: string };
  prompt: string;
}

const DAY = 86_400_000;

/** Pick the one situation that matters most today, from fields on the synthetic account only. */
export function journeyFor(p: Profile, today = new Date()): Journey {
  const { account: a, vehicle: v, customer: c, golden: g } = p;
  const serviceIn = (new Date(v.next_service_due + "T12:00:00").getTime() - today.getTime()) / DAY;
  const vehicleName = `${v.model_year} ${v.model}`;

  if (v.open_recall === "Y")
    return {
      kind: "safety",
      eyebrow: "Safety first",
      title: `Your ${vehicleName} has an open recall`,
      body: "Recall repairs are free at a Toyota dealer. Book that before making any financial change.",
      cta: { label: "See your vehicle record", to: "/my-toyota" },
      prompt: "My car has an open recall. What should I do first?",
    };
  if (a.missed_payments_12m >= 1 || c.vulnerable_flag === "Y" || c.financial_stress_score >= 50)
    return {
      kind: "payment",
      eyebrow: "Upcoming payment",
      title: "Let's make the next payment manageable",
      body: "See what each option would do to your payment and total cost. A specialist reviews any hardship change before it happens.",
      cta: { label: "Compare payment scenarios", to: "/insights#scenarios" },
      prompt: "My next payment is going to be hard. What are my options?",
    };
  if (a.contract_type === "lease" && a.months_remaining <= 6)
    return {
      kind: "lease",
      eyebrow: `Lease ends in ${a.months_remaining} month${a.months_remaining === 1 ? "" : "s"}`,
      title: "Plan your lease end",
      body: "Compare returning, buying, or moving into another Toyota using your residual and estimated vehicle value.",
      cta: { label: "Compare lease-end choices", to: "/my-toyota#options" },
      prompt: "My lease ends soon. What are my options?",
    };
  if (/trade|upgrade|bigger|baby|tundra|new toyota|fit/i.test(`${p.moment} ${g.best_next_move}`))
    return {
      kind: "compare",
      eyebrow: "Your needs changed",
      title: "Find a Toyota that fits what's next",
      body: "Compare models on seating, efficiency, and cost of ownership, then see how it would sit next to your current agreement.",
      cta: { label: "Compare models", to: "/compare" },
      prompt: `Which Toyota would fit my situation better than my ${v.model}?`,
    };
  if (serviceIn <= 45)
    return {
      kind: "maintenance",
      eyebrow: serviceIn < 0 ? "Service overdue" : "Service coming up",
      title: `Plan service for your ${vehicleName}`,
      body: "Your record shows the next service date. ToyotaCare and warranty dates are on your vehicle record.",
      cta: { label: "See your vehicle record", to: "/my-toyota" },
      prompt: "What maintenance is coming up for my car?",
    };
  return {
    kind: "steady",
    eyebrow: "On track",
    title: g.best_next_move,
    body: g.plain_language_message,
    cta: { label: "See your next move", to: "/my-toyota" },
    prompt: "What's the smartest next move for me right now?",
  };
}
