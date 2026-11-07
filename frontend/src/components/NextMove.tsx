import { CheckCircle2, MousePointerClick, PhoneForwarded, Tag } from "lucide-react";
import { useState } from "react";
import type { NextStepType, Profile } from "../data/types";

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
    <section className="rounded-3xl border border-line bg-paper p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="flex items-center gap-2 rounded-full bg-signal/10 px-3 py-1 font-medium text-signal">
          <Icon className="h-4 w-4" /> {g.next_step_type === "Offer" ? "An option you can review" : g.next_step_type}
        </span>
        <span className="text-muted">{meta.blurb}</span>
      </div>
      <h3 className="mt-4 max-w-[22ch] text-3xl font-semibold tracking-tight md:text-4xl">{g.best_next_move}</h3>
      <p className="mt-4 max-w-[65ch] text-lg leading-relaxed text-ink/80">{g.plain_language_message}</p>

      <div className="mt-6 grid gap-4 text-sm md:grid-cols-2">
        <div className="rounded-2xl bg-daylight p-4">
          <div className="font-medium">Why this, and not the other paths</div>
          <p className="mt-1 leading-relaxed text-muted">{g.why_not_the_others}</p>
        </div>
        <div className="rounded-2xl border border-sodium/40 bg-sodium/10 p-4">
          <div className="font-medium text-caution">What has to stay true</div>
          <p className="mt-1 leading-relaxed text-ink/80">{g.guardrail_notes}</p>
        </div>
      </div>

      <p className="mt-4 text-sm text-muted">This is not an approval. Toyota Financial Services still has to confirm eligibility, and nothing on your contract changes until you authorize it.</p>

      <div className="mt-6">
        {sent ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-go px-5 py-3 font-medium text-white" role="status">
            <CheckCircle2 className="h-5 w-5" /> {meta.done}
          </span>
        ) : (
          <button
            onClick={() => setSentFor(p.customer.customer_id)}
            className="rounded-full bg-signal px-5 py-3 font-medium text-white hover:bg-signal-deep"
          >
            {meta.cta}
          </button>
        )}
      </div>
    </section>
  );
}
