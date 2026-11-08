import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Profile } from "../data/types";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export const money = (n: number | null | undefined, cents = false) =>
  n == null ? "—" : (cents ? usd2 : usd0).format(n);

/** "+$57" / "−$114" with a real minus sign. */
export const delta = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (Math.abs(n) < 0.5) return "$0";
  return `${n > 0 ? "+" : "−"}${usd0.format(Math.abs(n))}`;
};

export const miles = (n: number) => `${n.toLocaleString("en-US")} mi`;

export const date = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return iso && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—";
};

/** Guardrail flags derived from the data pack's responsible-AI rules (starter_system_prompt.txt). */
export function guardrails(p: Profile) {
  const flags: { id: string; tone: "stop" | "caution" | "info"; title: string; body: string }[] = [];
  if (p.customer.vulnerable_flag === "Y" || p.account.missed_payments_12m >= 2)
    flags.push({
      id: "human",
      tone: "stop",
      title: "Route to a specialist",
      body: "Vulnerable or distressed customer. No upsell, no marketing — a person reviews any hardship option.",
    });
  if (p.customer.marketing_consent === "N")
    flags.push({
      id: "consent",
      tone: "caution",
      title: "No marketing consent",
      body: "Don't present new-vehicle offers.",
    });
  if (p.vehicle.open_recall === "Y")
    flags.push({ id: "recall", tone: "stop", title: "Open recall", body: "Lead with safety before anything financial." });
  if (p.account.missed_payments_12m === 1)
    flags.push({
      id: "missed",
      tone: "caution",
      title: "1 missed payment (12 mo)",
      body: "Refinance isn't available right now.",
    });
  if (p.customer.preferred_channel === "Phone")
    flags.push({ id: "phone", tone: "info", title: "Prefers phone", body: "Confirm next steps by voice, not just a link." });
  return flags;
}

export function stressLabel(score: number) {
  if (score >= 60) return { label: "High", cls: "bg-signal text-white" };
  if (score >= 35) return { label: "Medium", cls: "bg-sodium text-night" };
  return { label: "Low", cls: "bg-go/15 text-go" };
}
