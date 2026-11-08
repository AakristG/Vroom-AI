import { CalendarClock, CheckCircle2, MousePointerClick, PhoneForwarded, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { getActivity, type AppointmentRecord, type PendingActionCard } from "../api/client";
import type { NextStepType, Profile } from "../data/types";
import { ACTIVITY_REFRESH_EVENT } from "../lib/activityRefresh";

const stepMeta: Record<NextStepType, { icon: typeof Tag; blurb: string }> = {
  "Self-service": {
    icon: MousePointerClick,
    blurb: "The customer can finish this alone in a minute or two.",
  },
  "Follow-up": {
    icon: PhoneForwarded,
    blurb: "A person confirms eligibility before anything is promised.",
  },
  Offer: {
    icon: Tag,
    blurb: "Eligible today. Nothing changes until the customer approves.",
  },
};

function statusLine(pending: PendingActionCard | null, appointments: AppointmentRecord[]): string {
  if (pending && (pending.status === "awaiting_intent_confirmation" || pending.status === "awaiting_final_confirmation")) {
    return pending.stage === "final"
      ? "You have a specialist request waiting for final confirmation below."
      : "You have a specialist request waiting for the first confirmation below.";
  }
  const latest = appointments[0];
  if (!latest) return "No appointments or requests yet.";
  const label = latest.status_label || latest.status;
  const when = latest.preferred_when ? ` · Preferred: ${latest.preferred_when}` : "";
  return `${label}: ${latest.category}${when}`;
}

export function NextMove({ p }: { p: Profile }) {
  const g = p.golden;
  const meta = stepMeta[g.next_step_type];
  const Icon = meta.icon;
  const [pending, setPending] = useState<PendingActionCard | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await getActivity();
        if (!alive) return;
        setPending(data.pending_action);
        setAppointments(data.appointments || []);
      } catch {
        if (!alive) return;
        setPending(null);
        setAppointments([]);
      } finally {
        if (alive) setLoaded(true);
      }
    }
    void load();
    const onRefresh = () => void load();
    window.addEventListener(ACTIVITY_REFRESH_EVENT, onRefresh);
    return () => {
      alive = false;
      window.removeEventListener(ACTIVITY_REFRESH_EVENT, onRefresh);
    };
  }, [p.customer.customer_id]);

  const hasOpen =
    Boolean(pending && (pending.status === "awaiting_intent_confirmation" || pending.status === "awaiting_final_confirmation")) ||
    appointments.length > 0;

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

      <div className="mt-6 rounded-2xl border border-line bg-daylight/60 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          {hasOpen ? <CheckCircle2 className="h-4 w-4 text-go" /> : <CalendarClock className="h-4 w-4 text-muted" />}
          Your requests and appointments
        </div>
        <p className="mt-1 text-muted" role="status">
          {!loaded ? "Checking your account…" : statusLine(pending, appointments)}
        </p>
        <p className="mt-2 text-xs text-muted">
          Use <a href="#phone-desk" className="font-medium text-ink underline-offset-2 hover:underline">Talk with an AI agent</a> below to submit a specialist request, then confirm it twice. Recorded items appear under Requests and appointments.
        </p>
      </div>
    </section>
  );
}
