import { useEffect, useState, type FormEvent } from "react";
import { apiClient } from "../api/client";
import type { Profile } from "../data/types";
import { cn, money } from "../lib/format";

type Turn = { id: string; role: "user" | "agent"; content: string };
const topics = ["Refinance", "Trade-in", "Vehicle information"] as const;

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
    setBusy(true);
    setStatus(null);
    try {
      const { data } = await apiClient.post("/api/voice/appointments/", {
        customer_id: p.customer.customer_id,
        name: p.customer.first_name,
        topic,
        when,
        phone,
      });
      const call = data.call?.status;
      const sms = data.appointment?.sms;
      if (call === "calling") setStatus("Toyota Financial is calling the number you entered. This page will show the conversation.");
      else if (sms === "sent") setStatus("A representative time is saved, and a text confirmation was sent. The phone call starts when Retell is configured.");
      else setStatus("A representative time is saved. Connect Retell and Twilio to place the call and send the text.");
    } catch {
      setStatus("That request did not go through. Check the time and phone number, and that the backend is running.");
    } finally {
      setBusy(false);
    }
  }

  async function lookupVehicle() {
    setBusy(true);
    setVehicleNote(null);
    try {
      const { data } = await apiClient.get("/api/voice/vehicle/", {
        params: {
          year: p.vehicle.model_year,
          model: p.vehicle.model,
          trim: p.vehicle.trim,
          vin,
          mileage: p.vehicle.odometer_now,
          state: p.customer.state,
        },
      });
      if (data.source === "not_configured") {
        setVehicleNote(`CarsXE is not connected. The account estimate is ${money(p.vehicle.est_market_value_now)}, and it is not a guaranteed trade-in.`);
      } else if (data.trade_in) {
        setVehicleNote(`CarsXE trade-in value, clean condition: ${money(Number(data.trade_in))}. Retail: ${money(Number(data.retail))}. This is a market figure, not an offer from Toyota.`);
      } else {
        const name = data.specs?.name ? ` CarsXE matched ${data.specs.name}.` : "";
        setVehicleNote(`${data.trade_in_note || "No trade-in price came back."}${name} Account estimate: ${money(p.vehicle.est_market_value_now)}.`);
      }
    } catch {
      setVehicleNote("The vehicle lookup did not respond. Your account estimate is still on this page.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-paper p-6 md:p-8">
      <h2 className="text-2xl font-semibold tracking-tight">Talk with a person, by phone</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        Schedule a call about refinancing, a trade-in, or your vehicle. If a call is connected for this account, the transcript shows up here while you stay on the page.
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
          <button disabled={busy} className="w-full rounded-full bg-ink px-4 py-3 text-sm font-medium text-white hover:bg-black disabled:opacity-50">
            Schedule the call
          </button>
        </div>
      </form>
      {status && <p className="mt-3 text-sm">{status}</p>}

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
