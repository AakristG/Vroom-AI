import { Phone, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { checkBackendHealth, sendChatMessage, type ChatMessage } from "../api/client";
import type { Profile } from "../data/types";
import { useLiveCall } from "../hooks/useLiveCall";
import { cn } from "../lib/format";
import { VoiceWidget } from "./VoiceWidget";

type LiveTurn = { id: string; role: "user" | "assistant"; content: string };

const stepTitle: Record<string, string> = {
  verify_caller: "Confirmed this is your account",
  extract_situation: "Noted what you told us",
  get_account: "Read your contract",
  confirm_values: "Read your payment back to you",
  get_options: "Looked up options on your agreement",
  check_guardrails: "Checked the rules that apply to you",
  recommend: "Prepared a next step for you to approve",
};

export function CustomerTalk({ p }: { p: Profile }) {
  const { state, turns, steps, startDemo, end } = useLiveCall(p);
  const scroller = useRef<HTMLDivElement>(null);
  const [showChecks, setShowChecks] = useState(false);
  const [live, setLive] = useState<LiveTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const running = state === "connecting" || state === "live";

  useEffect(() => {
    setLive([]);
    setDraft("");
    setError(null);
    checkBackendHealth().then(setBackendOk);
  }, [p.customer.customer_id]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns, steps, live, busy]);

  function playSample() {
    setLive([]);
    startDemo();
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const next: LiveTurn[] = [...live, { id: `u-${Date.now()}`, role: "user", content: text }];
    setLive(next);
    setDraft("");
    setBusy(true);
    setError(null);
    const messages: ChatMessage[] = next.map(({ role, content }) => ({ role, content }));
    try {
      const reply = await sendChatMessage(messages, p.customer.customer_id);
      setLive((current) => [...current, { id: `a-${Date.now()}`, role: "assistant", content: reply || "I don't have a reply for that." }]);
      setBackendOk(true);
    } catch {
      setBackendOk(false);
      setError("Nemotron isn't available right now. Your account on this page is unchanged.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="talk" className="rounded-3xl border border-line bg-paper p-6 shadow-sm md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Talk with Toyota Financial</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Ask about your agreement in your own words. Nemotron answers from the account on file, and a phone call uses the same assistant. Nothing here changes your contract.
          </p>
          <p className="mt-2 text-xs text-muted">
            {backendOk === null ? "Checking the assistant…" : backendOk ? "Nemotron is connected." : "Assistant offline — the sample call still works."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {running ? (
            <button onClick={end} className="rounded-full bg-signal px-4 py-2 text-sm font-medium text-white hover:bg-signal-deep">
              End conversation
            </button>
          ) : (
            <button onClick={playSample} className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black">
              <Phone className="h-4 w-4" /> {state === "ended" ? "Replay" : "Play a sample call"}
            </button>
          )}
          <VoiceWidget variant="light" customerId={p.customer.customer_id} />
        </div>
      </div>

      <div ref={scroller} className="mt-6 max-h-96 space-y-3 overflow-y-auto rounded-2xl bg-[#f7f7f7] p-4" aria-live="polite">
        {live.length === 0 && turns.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted">
            Ask a question about your {p.vehicle.model_year} {p.vehicle.model}, or play the sample call. Dollar amounts are repeated before they are used.
          </p>
        ) : live.length > 0 ? (
          live.map((t) => (
            <div key={t.id} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  t.role === "user" ? "bg-ink text-white" : "bg-paper text-ink shadow-sm"
                )}
              >
                <div className={cn("mb-1 text-[11px]", t.role === "user" ? "text-white/60" : "text-muted")}>
                  {t.role === "user" ? "You" : "Toyota Financial"}
                </div>
                {t.content}
              </div>
            </div>
          ))
        ) : (
          turns.map((t) => (
            <div key={t.id} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  t.role === "user" ? "bg-ink text-white" : "bg-paper text-ink shadow-sm"
                )}
              >
                <div className={cn("mb-1 text-[11px]", t.role === "user" ? "text-white/60" : "text-muted")}>
                  {t.role === "user" ? "You" : "Toyota Financial"}
                </div>
                {t.content}
              </div>
            </div>
          ))
        )}
        {busy && <p className="text-sm text-muted">Checking your agreement…</p>}
        {error && <p className="text-sm text-signal">{error}</p>}
      </div>

      <form onSubmit={ask} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="ask-tfs">
          Ask about your account
        </label>
        <input
          id="ask-tfs"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Ask about your ${p.account.contract_type}`}
          className="min-w-0 flex-1 rounded-full border border-line px-4 py-3 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="flex items-center gap-2 rounded-full bg-signal px-4 py-3 text-sm font-medium text-white hover:bg-signal-deep disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Send
        </button>
      </form>

      {steps.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowChecks((v) => !v)} className="text-sm font-medium text-signal">
            {showChecks ? "Hide" : "Show"} what we checked ({steps.length})
          </button>
          {showChecks && (
            <ol className="mt-3 space-y-3 text-sm">
              {steps.map((s) => (
                <li key={s.id}>
                  <div className="font-medium">{stepTitle[s.tool] ?? s.tool}</div>
                  <div className="text-muted">{s.detail}</div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
