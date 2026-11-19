import { useCallback, useEffect, useState } from "react";
import { getActivity, type AppointmentRecord, type CustomerTimelineEvent, type PendingActionCard } from "../api/client";
import { ACTIVITY_REFRESH_EVENT } from "../lib/activityRefresh";
import { ConfirmActionCard } from "./ConfirmActionCard";

function emailLabel(status: string): string {
  switch (status) {
    case "sent":
      return "Email accepted by provider";
    case "failed":
      return "Email failed";
    case "not_configured":
      return "Email not configured";
    case "not_sent":
      return "Email not sent";
    default:
      return status || "Unknown";
  }
}

export function AppointmentsPanel() {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [events, setEvents] = useState<CustomerTimelineEvent[]>([]);
  const [pending, setPending] = useState<PendingActionCard | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getActivity();
      setAppointments(data.appointments || []);
      setEvents(data.events || []);
      setPending(data.pending_action);
      setNote(data.representatives?.note || null);
      setError(null);
    } catch {
      setError("Could not load requests and appointments. Your account is unchanged.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8000);
    const onRefresh = () => void refresh();
    window.addEventListener(ACTIVITY_REFRESH_EVENT, onRefresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(ACTIVITY_REFRESH_EVENT, onRefresh);
    };
  }, [refresh]);

  return (
    <section id="appointments" className="rounded-3xl border border-line bg-paper p-6 md:p-8">
      <h2 className="text-2xl font-semibold tracking-tight">Requests and appointments</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Recorded specialist requests from chat, browser voice, and phone. A pending request is never shown as a confirmed calendar booking.
      </p>
      {pending ? (
        <div className="mt-4">
          <ConfirmActionCard action={pending} onDone={refresh} onChange={setPending} />
        </div>
      ) : null}
      {loading ? <p className="mt-4 text-sm text-muted">Loading your requests…</p> : null}
      {error ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-signal">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()} className="font-semibold underline-offset-2 hover:underline">
            Try again
          </button>
        </div>
      ) : null}
      {!loading && !error && appointments.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No appointments or requests yet.</p>
      ) : null}
      {appointments.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {appointments.map((item) => (
            <li key={item.appointment_id} className="rounded-2xl border border-line px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">{item.category}</div>
                <span className="rounded-full bg-mist px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink/70">
                  {item.status_label || item.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted">ID: {item.appointment_id}</div>
              <div className="mt-2 space-y-0.5 text-muted">
                {item.preferred_when ? (
                  <div>
                    {item.is_confirmed_booking ? "Confirmed" : "Requested"}: {item.preferred_when}
                    {item.customer_time_zone ? ` (${item.customer_time_zone})` : ""}
                  </div>
                ) : null}
                {item.representative_label ? <div>Representative: {item.representative_label}</div> : null}
                {item.location_label ? <div>Location: {item.location_label}</div> : null}
                {item.contact_phone ? <div>Contact: {item.contact_phone}</div> : null}
                <div>
                  {emailLabel(item.email_status)}
                  {item.source ? ` · Source: ${item.source}` : ""}
                </div>
              </div>
              {!item.is_confirmed_booking && item.status !== "cancelled" && item.status !== "failed" ? (
                <p className="mt-2 text-xs text-caution">Awaiting confirmation — not a booked calendar appointment.</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="mt-4 text-xs text-muted">{note}</p> : null}
      {events.length > 0 ? (
        <ol className="mt-6 space-y-2 border-t border-line pt-4 text-xs text-muted">
          {events.slice(0, 8).map((event) => (
            <li key={event.event_id}>
              {new Date(event.occurred_at).toLocaleString()} · {event.channel} · {event.type.replace(/_/g, " ")}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
