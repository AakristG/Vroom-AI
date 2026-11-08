import { useEffect, useState, type FormEvent } from "react";
import { apiClient, requestCallback, type PendingActionCard } from "../api/client";
import type { Profile } from "../data/types";
import { requestActivityRefresh } from "../lib/activityRefresh";
import { cn, money } from "../lib/format";
import { ConfirmActionCard } from "./ConfirmActionCard";

type Turn = { id: string; role: "user" | "agent"; content: string };
const topics = ["Refinance", "Trade-in", "Vehicle information"] as const;

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function PhoneDesk({ p }: { p: Profile }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [listening, setListening] = useState(true);
  const [topic, setTopic] = useState<(typeof topics)[number]>("Refinance");
  const [when, setWhen] = useState("");
  const [phone, setPhone] = useState("");
  const [vin, setVin] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [vehicleNote, setVehicleNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingActionCard | null>(null);

  useEffect(() => {
    if (!listening) return;
    let stop = false;
    const pull = async () => {
      try {
        const { data } = await apiClient.get<{ turns: Turn[] }>("/api/voice/live/", {
          params: { customer_id: p.customer.customer_id },
        });
        if (!stop && data.turns?.length) setTurns(data.turns);
      } catch {
        /* The page still works when the phone bridge is offline. */
      }
    };
    pull();
    const timer = window.setInterval(pull, 3000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [listening, p.customer.customer_id]);

  async function book(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setStatus(null);
    const digits = phoneDigits(phone);
    if (digits.length < 10) {
      setStatus("Enter a valid phone number with at least 10 digits.");
      return;
    }
    if (!when) {
      setStatus("Choose a date and time for the callback.");
      return;
    }
    const cleanedVin = vin.trim().toUpperCase();
    if (cleanedVin && (cleanedVin.length !== 17 || !/^[A-HJ-NPR-Z0-9]{17}$/i.test(cleanedVin))) {
      setStatus("VIN must be exactly 17 letters or digits when provided.");
      return;
    }
    setBusy(true);
    try {
      const data = await requestCallback({
        customer_id: p.customer.customer_id,
        name: p.customer.first_name,
        topic,
        when,
        phone,
        vin: cleanedVin || undefined,
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago",
      });
      if (data.action) {
        setPending(data.action);
        setStatus(
          data.detail ||
            "Review the request below and confirm twice. Nothing is recorded until both confirmations succeed."
        );
        requestActivityRefresh();
      } else {
        setStatus("The server did not return a confirmation step. Your account was not changed.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setStatus(message || "That request did not go through. Check the time and phone number, and that the backend is running.");
    } finally {
      setBusy(false);
    }
  }

  async function lookupVehicle() {
    setBusy(true);
    setVehicleNote(null);
    const cleanedVin = vin.trim().toUpperCase();
    if (cleanedVin && (cleanedVin.length !== 17 || !/^[A-HJ-NPR-Z0-9]{17}$/i.test(cleanedVin))) {
      setVehicleNote("VIN must be exactly 17 letters or digits when provided.");
      setBusy(false);
      return;
    }
    try {
      const { data } = await apiClient.get("/api/voice/vehicle/", {
        params: {
          year: p.vehicle.model_year,
          model: p.vehicle.model,
          trim: p.vehicle.trim,
          vin: cleanedVin,
          mileage: p.vehicle.odometer_now,
          state: p.customer.state,
        },
      });
      if (data.specs?.name) {
        setVehicleNote(
          `${data.specs.name}. ${data.trade_in_note || "Verified pricing is not currently connected."} Account figure on file: ${money(p.vehicle.est_market_value_now)} (not a trade-in offer).`
        );
      } else {
        setVehicleNote(data.detail || data.trade_in_note || "Verified pricing is not currently connected.");
      }
    } catch {
      setVehicleNote("The vehicle lookup did not respond. Your account estimate is still on this page.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="phone-desk" className="rounded-3xl border border-line bg-paper p-6 md:p-8">
      <h2 className="text-2xl font-semibold tracking-tight">Talk with an AI agent</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Schedule a call about refinancing, a trade-in, or your vehicle. After you submit, confirm twice. Until both confirmations succeed, nothing is recorded on your account.
      </p>

      <form onSubmit={book} className="mt-5 grid gap-3 md:grid-cols-4">
        <label className="text-sm md:col-span-1">
          <span className="font-medium">Topic</span>
          <select value={topic} onChange={(event) => setTopic(event.target.value as (typeof topics)[number])} className="mt-1 w-full rounded-2xl border border-line px-3 py-3">
            {topics.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">When</span>
          <input required type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} className="mt-1 w-full rounded-2xl border border-line px-3 py-3" />
        </label>
        <label className="text-sm">
          <span className="font-medium">Your phone</span>
          <input required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1..." className="mt-1 w-full rounded-2xl border border-line px-3 py-3" />
        </label>
        <div className="flex items-end">
          <button disabled={busy || Boolean(pending && pending.status !== "completed" && pending.status !== "cancelled")} className="w-full rounded-full bg-ink px-4 py-3 text-sm font-medium text-white hover:bg-black disabled:opacity-50">
            Schedule the call
          </button>
        </div>
      </form>
      {status && <p className="mt-3 text-sm">{status}</p>}
      {pending ? (
        <div className="mt-4">
          <ConfirmActionCard
            action={pending}
            onChange={setPending}
            onDone={() => {
              requestActivityRefresh();
              setStatus("Request recorded. Check Requests and appointments below for status and email delivery.");
            }}
          />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="font-medium">VIN, if you have it</span>
          <input value={vin} onChange={(event) => setVin(event.target.value)} placeholder="17 characters" className="mt-1 block rounded-2xl border border-line px-3 py-3" />
        </label>
        <button type="button" disabled={busy} onClick={lookupVehicle} className="rounded-full border border-line px-4 py-3 text-sm font-medium hover:border-ink disabled:opacity-50">
          Look up trade-in data
        </button>
        <button type="button" onClick={() => setListening((value) => !value)} className="rounded-full border border-line px-4 py-3 text-sm font-medium hover:border-ink">
          {listening ? "Pause live transcript" : "Resume live transcript"}
        </button>
      </div>
      {vehicleNote && <p className="mt-3 text-sm leading-relaxed text-muted">{vehicleNote}</p>}

      <div className="mt-5 max-h-72 space-y-3 overflow-y-auto rounded-2xl bg-[#f7f7f7] p-4" aria-live="polite">
        {turns.length === 0 ? (
          <p className="text-sm text-muted">No live call yet. A phone call for {p.customer.first_name} will appear here as it happens.</p>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-2 text-sm", turn.role === "user" ? "bg-ink text-white" : "bg-paper shadow-sm")}>
                <div className={cn("mb-1 text-[11px]", turn.role === "user" ? "text-white/60" : "text-muted")}>{turn.role === "user" ? "You" : "Toyota Financial"}</div>
                {turn.content}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
