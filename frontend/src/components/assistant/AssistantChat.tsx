import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  CalendarClock,
  Car,
  ChevronDown,
  Compass,
  Fuel,
  Mic,
  PhoneCall,
  RefreshCw,
  Scale,
  Send,
  Trash2,
  TrendingDown,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestCallback, sendAssistantMessage, type AssistantAction, type AssistantTool, type PendingActionCard } from "../../api/client";
import { parseVehicleId } from "../../api/vehicles";
import { cn } from "../../lib/format";
import { journeyFor } from "../../lib/journey";
import { sanitizeAssistantText } from "../../lib/sanitizeAssistantText";
import { vehicleName } from "../../lib/spec";
import type { VoiceCaption } from "../../lib/voiceCaptions";
import { useAssistant, type Turn } from "../../state/assistant";
import { useAuth } from "../../state/auth";
import { useVoiceSession } from "../../state/voiceSession";
import { ConfirmActionCard } from "../ConfirmActionCard";
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
  shop_vehicles: "Vehicle suggestions",
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

interface Suggestion {
  q: string;
  icon: LucideIcon;
}

function suggestions(page: string, vehicles: string[], signedIn: boolean, isLease: boolean, journeyPrompt: string | null): Suggestion[] {
  const pageSpecific: Suggestion[] =
    page === "compare" && vehicles.length > 1
      ? [
          { q: "Which of these makes more sense for my commute?", icon: Car },
          { q: "How much could I spend on fuel each year?", icon: Fuel },
        ]
      : page === "vehicle-detail" && vehicles.length
        ? [{ q: `Tell me about the ${vehicleName(parseVehicleId(vehicles[0]))}.`, icon: Car }]
        : [];
  if (!signedIn)
    return [
      ...pageSpecific,
      { q: "Which is better for a long commute, a Prius or a Corolla?", icon: Car },
      { q: "Compare a Camry and a RAV4", icon: Scale },
      { q: "What can this assistant do?", icon: Compass },
    ].slice(0, 4);
  const account: Suggestion[] = isLease
    ? [
        { q: journeyPrompt ?? "My lease ends soon. What are my options?", icon: CalendarClock },
        { q: "Should I buy my leased car?", icon: Wallet },
        { q: "Which Toyota could fit my budget?", icon: Car },
        { q: "What is my smartest next move?", icon: Compass },
      ]
    : [
        { q: journeyPrompt ?? "Can I lower my monthly payment?", icon: Wallet },
        { q: "What happens if I pay extra toward my loan?", icon: TrendingDown },
        { q: "How much equity do I have?", icon: Scale },
        { q: "Which Toyota could fit my budget?", icon: Car },
        { q: "What is my smartest next move?", icon: Compass },
      ];
  return [...pageSpecific, ...account].slice(0, 5);
}

/** The model is told to answer in plain text; strip stray markdown emphasis and split into paragraphs and bullet lists. */
function Prose({ text, muted }: { text: string; muted?: boolean }) {
  const blocks = sanitizeAssistantText(text)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className={cn("space-y-2.5 text-sm leading-relaxed", muted && "text-caution")}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*([-•*]|\d+[.)])\s+/.test(l)))
          return (
            <ul key={i} className="space-y-1.5">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2">
                  {/^\s*\d+[.)]/.test(l) ? (
                    <span className="shrink-0 font-semibold text-signal">{l.match(/\d+/)?.[0]}.</span>
                  ) : (
                    <span className="shrink-0 text-signal">–</span>
                  )}
                  <span>{l.replace(/^\s*([-•*]|\d+[.)])\s+/, "")}</span>
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}

export function AssistantChat({ compact = false }: { compact?: boolean }) {
  const { profile } = useAuth();
  const { context, pending, clearPending, turns, setTurns } = useAssistant();
  const voice = useVoiceSession();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const customerId = profile?.customer.customer_id ?? null;
  const journey = profile ? journeyFor(profile) : null;
  const voiceActive = voice.status === "connecting" || voice.status === "live";
  const liveCaptions = voice.captions.filter((c) => (voice.callId ? c.callId === voice.callId : true));
  const committedVoiceIds = useRef<Set<string>>(new Set());

  // When a call ends, fold finalized captions into the durable chat turns (no second text-chat request).
  const prevStatus = useRef(voice.status);
  useEffect(() => {
    const wasLive = prevStatus.current === "live" || prevStatus.current === "connecting";
    prevStatus.current = voice.status;
    if (!wasLive || (voice.status !== "ended" && voice.status !== "error")) return;
    const callId = voice.callId;
    const spoken = voice.captions.filter((c) => (!callId || c.callId === callId) && c.text.trim());
    if (!spoken.length) return;
    setTurns((cur) => {
      const extras: Turn[] = [];
      for (const c of spoken) {
        if (committedVoiceIds.current.has(c.id)) continue;
        committedVoiceIds.current.add(c.id);
        extras.push({
          id: c.id,
          role: c.role,
          content: c.text,
          voice: true,
          voiceInterrupted: c.interrupted,
        });
      }
      return extras.length ? [...cur, ...extras] : cur;
    });
  }, [voice.status, voice.callId, voice.captions, setTurns]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottom.current) return;
    if (turns.length === 0 && !busy && liveCaptions.length === 0 && !voiceActive) return;
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy, liveCaptions, voiceActive, voice.agentSpeaking, voice.userListening]);

  // A different signed-in customer must not see the previous customer's conversation.
  const owner = useRef(customerId);
  const clearVoiceSession = voice.clearVoiceSession;
  useEffect(() => {
    if (owner.current !== customerId) {
      setTurns([]);
      committedVoiceIds.current.clear();
      clearVoiceSession();
      owner.current = customerId;
    }
  }, [customerId, setTurns, clearVoiceSession]);

  async function send(text: string, { retry = false } = {}) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Turn[] = retry ? turns : [...turns, { id: `u-${Date.now()}`, role: "user", content }];
    setTurns(next);
    if (!retry) setDraft("");
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

  const journeyPrompt = journey && (journey.kind === "lease" || journey.kind === "payment" || journey.kind === "safety") ? journey.prompt : null;
  const isLease = profile?.account.contract_type === "lease";
  const cards = suggestions(context.page, context.vehicles ?? [], Boolean(profile), isLease, journeyPrompt);
  const lastUser = [...turns].reverse().find((t) => t.role === "user");

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
        {turns.length === 0 && liveCaptions.length === 0 && !voiceActive && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
            <p className={cn("font-semibold tracking-tight", compact ? "text-xl" : "text-3xl")}>
              {profile ? `Hi ${profile.customer.first_name}, what would you like to figure out today?` : "How can I help with your Toyota?"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {profile
                ? "I answer from your simulated account and the vehicle catalog, checked by backend tools. I can't change your contract, and anything that needs a decision waits for your confirmation."
                : "Ask about models, fuel costs, or how financing works. Sign in to ask about your own account."}
            </p>
            <div className={cn("mt-5 grid gap-2", !compact && "sm:grid-cols-2")}>
              {cards.map(({ q, icon: Icon }) => (
                <button
                  key={q}
                  onClick={() => void send(q)}
                  className="group flex items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3 text-left text-sm transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:border-ink/40 hover:shadow-[var(--shadow-soft)]"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mist text-ink/70 transition-colors duration-200 group-hover:bg-signal group-hover:text-white">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1">{q}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-60" />
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {turns.map((t) => (
          <Message key={t.id} turn={t} customerId={customerId} name={profile?.customer.first_name ?? ""} />
        ))}
        {voiceActive && (
          <div className="space-y-3" aria-live="polite">
            <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-signal">
              {voice.status === "connecting"
                ? "Connecting voice call…"
                : voice.userListening
                  ? "Listening…"
                  : voice.agentSpeaking
                    ? "Toyota AI speaking"
                    : "Voice call live"}
              {voice.captionsUnavailable && (
                <span className="rounded-full bg-mist px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted">Live captions unavailable</span>
              )}
            </p>
            {liveCaptions.length === 0 && !voice.captionsUnavailable && (
              <p className="text-xs text-muted">Captions appear here as you and Toyota AI speak.</p>
            )}
            {liveCaptions.map((c) => (
              <VoiceCaptionBubble key={c.id} caption={c} />
            ))}
          </div>
        )}
        {busy && (
          <div role="status">
            <p className="text-xs font-medium text-muted">{profile ? "Checking your account and running the numbers…" : "Checking the vehicle catalog…"}</p>
            <div className="mt-2 space-y-1.5" aria-hidden>
              <div className="h-2.5 w-4/5 animate-pulse rounded bg-black/[0.06]" />
              <div className="h-2.5 w-3/5 animate-pulse rounded bg-black/[0.06]" />
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-signal/30 bg-signal/5 px-4 py-3 text-sm">
            <span className="flex-1">{error}</span>
            {lastUser && (
              <button onClick={() => void send(lastUser.content, { retry: true })} className="inline-flex items-center gap-1.5 text-xs font-semibold text-signal hover:underline">
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-line px-5 pb-5 pt-3">
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor={compact ? "assistant-input-dock" : "assistant-input"} className="sr-only">
            Ask Toyota Vroom AI
          </label>
          <input
            id={compact ? "assistant-input-dock" : "assistant-input"}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about payments, models, or costs"
            autoFocus={compact}
            autoComplete="off"
            className="field min-w-0 flex-1 rounded-full"
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Send" className="btn-primary px-4 disabled:opacity-40">
            <Send className="h-4 w-4" />
          </button>
        </form>
        {profile && (
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
            <span>Prefer to talk? Live captions appear in this chat.</span>
            <VoiceWidget variant="light" customerId={profile.customer.customer_id} />
          </div>
        )}
      </div>
    </div>
  );
}

function VoiceWave({ active }: { active: boolean }) {
  return (
    <span className="inline-flex h-3 items-end gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "w-0.5 rounded-full bg-current",
            active ? "motion-safe:animate-pulse" : "opacity-50",
            i === 1 ? "h-3" : "h-2"
          )}
          style={active ? { animationDelay: `${i * 120}ms` } : undefined}
        />
      ))}
    </span>
  );
}

function VoiceCaptionBubble({ caption }: { caption: VoiceCaption }) {
  if (caption.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-white">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/55">
            <Mic className="h-3 w-3" aria-hidden />
            You · Voice
            {!caption.isFinal && <span className="normal-case tracking-normal text-white/45">· listening</span>}
          </p>
          <p className="text-sm leading-relaxed">{caption.text}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-[85%]">
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
        Toyota AI · {caption.isSpeaking ? "Speaking" : caption.interrupted ? "Interrupted" : "Voice"}
        {caption.isSpeaking && <VoiceWave active />}
      </p>
      <p className={cn("text-sm leading-relaxed", caption.interrupted && "text-ink/80")}>{sanitizeAssistantText(caption.text)}</p>
    </div>
  );
}

function Message({ turn, customerId, name }: { turn: Turn; customerId: string | null; name: string }) {
  if (turn.role === "user")
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-white">
          {turn.voice && (
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/55">
              <Mic className="h-3 w-3" aria-hidden />
              You · Voice
            </p>
          )}
          <p className="text-sm leading-relaxed">{turn.content}</p>
        </div>
      </div>
    );
  if (turn.voice)
    return (
      <div className="max-w-[85%]">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
          Toyota AI · {turn.voiceInterrupted ? "Interrupted" : "Voice"}
        </p>
        <p className="text-sm leading-relaxed">{turn.content}</p>
      </div>
    );
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="max-w-[92%]">
      <Prose text={turn.content} muted={turn.offline} />
      {!turn.offline && (
        <p className="mt-2 text-[11px] text-muted">
          AI-generated explanation{turn.tools && turn.tools.length > 0 ? " · figures from the tools below" : ""}. Estimates are not approvals or offers.
        </p>
      )}
      {turn.tools && turn.tools.length > 0 && <ToolTrace tools={turn.tools} openByDefault={turn.offline} />}
      {turn.actions && turn.actions.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {turn.actions.map((a) => (
            <ActionButton key={a.label} action={a} customerId={customerId} name={name} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function ToolTrace({ tools, openByDefault = false }: { tools: AssistantTool[]; openByDefault?: boolean }) {
  const [open, setOpen] = useState(openByDefault);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-ink/75 transition-colors duration-150 hover:border-ink/40 hover:text-ink"
      >
        <Wrench className="h-3 w-3" /> {open ? "Hide calculation" : "Show how this was calculated"}
        <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="mt-2 text-[11px] text-muted">
              Sources: {tools.map((t) => TOOL_LABEL[t.name] ?? t.name.replace(/_/g, " ")).join(", ")}. Figures come from deterministic backend calculations on the
              simulated account and vehicle catalog, not from the language model.
            </p>
            <div className="mt-2 space-y-2">
              {tools.map((t, i) => (
                <div key={`${t.name}-${i}`} className="rounded-xl bg-mist p-3">
                  <div className="text-xs font-semibold">{TOOL_LABEL[t.name] ?? t.name.replace(/_/g, " ")}</div>
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

function isPendingAction(action: AssistantAction): action is PendingActionCard {
  return action.type === "pending_action";
}

export function ActionButton({ action, customerId, name }: { action: AssistantAction; customerId: string | null; name: string }) {
  const { setOpen } = useAssistant();
  const [confirming, setConfirming] = useState(false);
  const [phone, setPhone] = useState("");
  const [when, setWhen] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [pending, setPending] = useState<PendingActionCard | null>(null);

  if (isPendingAction(action)) return <ConfirmActionCard action={action} />;
  if (pending) return <ConfirmActionCard action={pending} onChange={setPending} />;

  if (action.type === "navigate")
    return (
      <Link to={action.to} onClick={() => setOpen(false)} className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-ink">
        {action.label} <ArrowRight className="h-3 w-3" />
      </Link>
    );

  if (!customerId) return null;

  return confirming ? (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (status === "sending") return;
        setStatus("sending");
        try {
          const res = await requestCallback({
            customer_id: customerId,
            name,
            topic: action.topic,
            when,
            phone,
            time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago",
          });
          if (res.action) setPending(res.action);
          else setStatus("error");
        } catch {
          setStatus("error");
        }
      }}
      className="rounded-2xl border border-line p-3 text-xs"
    >
      <p className="font-semibold">Ask a specialist to call you about {action.topic.toLowerCase()}</p>
      <p className="mt-1 text-muted">You will confirm twice before anything is recorded. This does not change your payment, due date, or contract.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" className="field py-2" aria-label="Phone number" />
        <input required type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="field py-2" aria-label="Preferred time" />
      </div>
      {status === "error" && <p className="mt-2 text-signal">That didn't go through. Please try again.</p>}
      <div className="mt-2 flex gap-2">
        <button disabled={status === "sending"} className="btn-primary px-4 py-2 text-xs">
          {status === "sending" ? "Starting…" : "Continue to confirmations"}
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
