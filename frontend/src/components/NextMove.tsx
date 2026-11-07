import { CheckCircle2, MousePointerClick, PhoneForwarded, Tag } from "lucide-react";
import { useState } from "react";
import type { NextStepType, Profile } from "../data/types";
import { money } from "../lib/format";

const stepMeta: Record<NextStepType, { icon: typeof Tag; cta: string; done: string; blurb: string }> = {
  "Self-service": {
    icon: MousePointerClick,
    cta: "Do it now in the app",
    done: "Sent to the customer's app",
    blurb: "The customer can finish this alone in a minute or two.",
  },
  "Follow-up": {
    icon: PhoneForwarded,
    cta: "Schedule a specialist call",
    done: "Specialist call requested",
    blurb: "A person confirms eligibility before anything is promised.",
  },
  Offer: {
    icon: Tag,
    cta: "Send the offer for review",
    done: "Offer sent for the customer to review",
    blurb: "Eligible today. Nothing changes until the customer approves.",
  },
};

export function NextMove({ p }: { p: Profile }) {
  const g = p.golden;
  const meta = stepMeta[g.next_step_type];
  const Icon = meta.icon;
  const [sentFor, setSentFor] = useState<string | null>(null);
  const sent = sentFor === p.customer.customer_id;

  return (
    <section className="relative overflow-hidden rounded-2xl bg-night p-6 text-white md:p-8">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-signal" />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
          <Icon className="h-4 w-4 text-sodium" /> {g.next_step_type === "Offer" ? "Eligible offer" : g.next_step_type}
        </span>
        <span className="text-white/60">{meta.blurb}</span>
      </div>
      <h3 className="mt-4 font-display text-[clamp(2.25rem,4vw,3.5rem)] leading-[0.95] tracking-wide">{g.best_next_move}</h3>
      <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-white/85">{g.plain_language_message}</p>

      <div className="mt-6 grid gap-4 text-sm md:grid-cols-2">
        <div className="rounded-xl bg-white/5 p-4">
          <div className="font-medium text-white">Why not the others</div>
          <p className="mt-1 leading-relaxed text-white/70">{g.why_not_the_others}</p>
        </div>
        <div className="rounded-xl border border-sodium/30 bg-sodium/10 p-4">
          <div className="font-medium text-sodium">Rules the agent follows here</div>
          <p className="mt-1 leading-relaxed text-white/80">{g.guardrail_notes}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        {sent ? (
          <span className="flex items-center gap-2 rounded-full bg-go px-5 py-3 font-medium" role="status">
            <CheckCircle2 className="h-5 w-5" /> {meta.done}
          </span>
        ) : (
          <button
            onClick={() => setSentFor(p.customer.customer_id)}
            className="rounded-full bg-signal px-5 py-3 font-medium hover:bg-signal-deep"
          >
            {meta.cta}
          </button>
        )}
        {p.offer && (
          <span className="text-sm text-white/60">
            Business value: {p.offer.business_value.toLowerCase()} · expected {money(g.expected_value_usd)} per customer
          </span>
        )}
      </div>
    </section>
  );
}
