import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, ChevronDown, PhoneCall, Send, Sparkles, Trash2, Wrench } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestCallback, sendAssistantMessage, type AssistantAction, type AssistantTool } from "../../api/client";
import { parseVehicleId } from "../../api/vehicles";
import { cn } from "../../lib/format";
import { journeyFor } from "../../lib/journey";
import { vehicleName } from "../../lib/spec";
import { useAssistant, type Turn } from "../../state/assistant";
import { useAuth } from "../../state/auth";
import { VoiceWidget } from "../VoiceWidget";

const TOOL_LABEL: Record<string, string> = {
  customer_profile: "Your account",
  payment_breakdown: "Payment breakdown",
  extra_payment_scenario: "Extra-payment scenario",
  term_extension_scenario: "Term-extension scenario",
  lease_end_options: "Lease-end options",
  next_actions: "Recommended next step",
  vehicle_lookup: "Vehicle specs",
  compare_vehicles: "Vehicle comparison",
  ownership_cost: "Fuel cost estimate",
};

const PAGE_LABEL: Record<string, string> = {
  home: "Home",
  explore: "Explore Vehicles",
  "vehicle-detail": "Vehicle details",
  compare: "Compare Models",
  "my-toyota": "My Toyota",
  insights: "Financial Insights",
  assistant: "AI Assistant",
  signin: "Sign in",
};

function suggestions(page: string, vehicles: string[], signedIn: boolean, leasePrompt: string | null): string[] {
  if (page === "compare" && vehicles.length > 1)
    return ["Which Toyota makes more sense for my commute?", "How much could I spend on fuel each year?", "Which one seats my family best?"];
  if (page === "vehicle-detail" && vehicles.length) return [`Tell me about the ${vehicleName(parseVehicleId(vehicles[0]))}.`, "How much could I spend on fuel each year?"];
  if (!signedIn) return ["Which is better for a long commute, a Prius or a Corolla?", "Compare a Camry and a RAV4", "What can this assistant do?"];
  return [
    leasePrompt ?? "Can you help me understand my monthly payment?",
    "What happens if I pay extra toward my loan?",
    "What's the smartest next move for me right now?",
  ];
}

/** Light cleanup: the model is told to answer in plain text, but strip stray markdown emphasis. */
const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "");

export function AssistantChat({ compact = false }: { compact?: boolean }) {
  const { profile } = useAuth();
  const { context, pending, clearPending, turns, setTurns } = useAssistant();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const customerId = profile?.customer.customer_id ?? null;
  const journey = profile ? journeyFor(profile) : null;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  // A different signed-in customer must not see the previous customer's conversation.
  const owner = useRef(customerId);
  useEffect(() => {
    if (owner.current !== customerId) {
      setTurns([]);
      owner.current = customerId;
    }
  }, [customerId, setTurns]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { id: `u-${Date.now()}`, role: "user", content }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const res = await sendAssistantMessage(
        next.filter((t) => !t.offline).map(({ role, content }) => ({ role, content })),
        context,
        customerId
      );
      setTurns((cur) => [
        ...cur,
        res.reply
          ? { id: `a-${Date.now()}`, role: "assistant", content: res.reply, tools: res.tools, actions: res.actions }
          : {
              id: `a-${Date.now()}`,
              role: "assistant",
              offline: true,
              content: "Nemotron is offline right now, so there's no written answer. Here is what the backend tools found:",
              tools: res.tools,
              actions: res.actions,
            },
      ]);
    } catch {
      setError("The assistant service isn't reachable. Your account is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  const consumed = useRef<string | null>(null);
  useEffect(() => {
    if (!pending) {
      consumed.current = null;
      return;
    }
    if (consumed.current === pending) return;
    consumed.current = pending;
    clearPending();
    void send(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  const leasePrompt = journey && (journey.kind === "lease" || journey.kind === "payment") ? journey.prompt : null;
  const chips = suggestions(context.page, context.vehicles ?? [], Boolean(profile), leasePrompt);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 text-[11px] text-muted">
        <span className="rounded-full bg-mist px-2 py-0.5">Viewing: {PAGE_LABEL[context.page] ?? context.page}</span>
        {(context.vehicles ?? []).map((id) => (
          <span key={id} className="rounded-full bg-mist px-2 py-0.5">
            {vehicleName(parseVehicleId(id))}
          </span>
        ))}
        <span className="rounded-full bg-mist px-2 py-0.5">{profile ? `Account: ${profile.customer.first_name} (simulated)` : "Not signed in"}</span>
        {turns.length > 0 && (
          <button onClick={() => setTurns([])} className="ml-auto flex items-center gap-1 hover:text-ink" aria-label="Clear conversation">
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
        {turns.length === 0 && (
          <div>
            <p className={cn("font-semibold tracking-tight", compact ? "text-lg" : "text-2xl")}>
              {profile ? `Hi ${profile.customer.first_name}, what would you like to figure out?` : "How can I help with your Toyota?"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Answers come from your simulated account and the vehicle catalog, checked by backend tools. I can't change your contract; any request needs your
              confirmation.
            </p>
          </div>
        )}
        {turns.map((t) => (
          <Message key={t.id} turn={t} customerId={customerId} name={profile?.customer.first_name ?? ""} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </span>
            Checking the data…
          </div>
        )}
        {error && <p className="text-sm text-signal">{error}</p>}
      </div>

      <div className="border-t border-line px-5 pb-5 pt-3">
        {turns.length < 2 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {chips.map((q) => (
              <button key={q} onClick={() => void send(q)} className="rounded-full border border-line bg-paper px-3 py-1.5 text-left text-xs transition-colors hover:border-ink">
                {q}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor={compact ? "assistant-input-dock" : "assistant-input"} className="sr-only">
            Ask Toyota NextMove AI
          </label>
          <input
            id={compact ? "assistant-input-dock" : "assistant-input"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about payments, models, or costs"
            className="field min-w-0 flex-1 rounded-full"
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Send" className="btn-primary px-4 disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </form>
        {profile && (
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
            <span>Prefer to talk? The phone agent uses the same Nemotron model.</span>
            <VoiceWidget variant="light" customerId={profile.customer.customer_id} />
          </div>
        )}
      </div>
    </div>
  );
}

function Message({ turn, customerId, name }: { turn: Turn; customerId: string | null; name: string }) {
  if (turn.role === "user")
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm leading-relaxed text-white">{turn.content}</div>
      </div>
    );
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-signal text-white">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("whitespace-pre-line text-sm leading-relaxed", turn.offline && "text-caution")}>{plain(turn.content)}</div>
        {turn.tools && turn.tools.length > 0 && <ToolTrace tools={turn.tools} openByDefault={turn.offline} />}
        {turn.actions && turn.actions.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {turn.actions.map((a) => (
              <ActionButton key={a.label} action={a} customerId={customerId} name={name} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ToolTrace({ tools, openByDefault = false }: { tools: AssistantTool[]; openByDefault?: boolean }) {
  const [open, setOpen] = useState(openByDefault);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
        <Wrench className="h-3 w-3" /> Checked: {tools.map((t) => TOOL_LABEL[t.name] ?? t.name).join(", ")}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 space-y-2">
              {tools.map((t, i) => (
                <div key={`${t.name}-${i}`} className="rounded-xl bg-mist p-3">
                  <div className="text-xs font-semibold">{TOOL_LABEL[t.name] ?? t.name}</div>
                  <dl className="mt-1 grid gap-x-3 gap-y-0.5 text-[11px] text-ink/80 sm:grid-cols-2">
                    {flatten(t.result)
                      .slice(0, 12)
                      .map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2">
                          <dt className="truncate text-muted">{k}</dt>
                          <dd className="text-right">{v}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function flatten(obj: unknown, prefix = ""): [string, string][] {
  if (obj == null) return [[prefix || "value", "Not available"]];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => flatten(v, `${prefix}${prefix ? " " : ""}${i + 1}`));
  if (typeof obj === "object")
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flatten(v, `${prefix ? `${prefix} · ` : ""}${k.replace(/_/g, " ")}`));
  return [[prefix, typeof obj === "number" ? obj.toLocaleString("en-US") : String(obj)]];
}

function ActionButton({ action, customerId, name }: { action: AssistantAction; customerId: string | null; name: string }) {
  const { setOpen } = useAssistant();
  const [confirming, setConfirming] = useState(false);
  const [phone, setPhone] = useState("");
  const [when, setWhen] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  if (action.type === "navigate")
    return (
      <Link to={action.to} onClick={() => setOpen(false)} className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-ink">
        {action.label} <ArrowRight className="h-3 w-3" />
      </Link>
    );

  if (!customerId) return null;
  if (status === "done")
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-go/10 px-3 py-2 text-xs font-medium text-go" role="status">
        <Check className="h-4 w-4" /> Request saved. A specialist will call {phone}. Nothing on your contract has changed.
      </p>
    );

  return confirming ? (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setStatus("sending");
        try {
          await requestCallback({ customer_id: customerId, name, topic: action.topic, when, phone });
          setStatus("done");
        } catch {
          setStatus("error");
        }
      }}
      className="rounded-2xl border border-line p-3 text-xs"
    >
      <p className="font-semibold">Confirm: ask a specialist to call you about {action.topic.toLowerCase()}</p>
      <p className="mt-1 text-muted">This only books a call. It does not change your payment, due date, or contract.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="field py-2" aria-label="Phone number" />
        <input required type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="field py-2" aria-label="Preferred time" />
      </div>
      {status === "error" && <p className="mt-2 text-signal">That didn't go through. Please try again.</p>}
      <div className="mt-2 flex gap-2">
        <button disabled={status === "sending"} className="btn-primary px-4 py-2 text-xs">
          {status === "sending" ? "Saving…" : "Confirm request"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="btn-ghost border-line px-4 py-2 text-xs">
          Cancel
        </button>
      </div>
    </form>
  ) : (
    <button onClick={() => setConfirming(true)} className="inline-flex w-fit items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-black">
      <PhoneCall className="h-3 w-3" /> {action.label}
    </button>
  );
}
