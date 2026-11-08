import { useEffect, useState } from "react";
import { getActivity, type AppointmentRecord, type CustomerTimelineEvent, type PendingActionCard } from "../api/client";
import { ConfirmActionCard } from "./ConfirmActionCard";

export function AppointmentsPanel() {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [events, setEvents] = useState<CustomerTimelineEvent[]>([]);
  const [pending, setPending] = useState<PendingActionCard | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function refresh() {
    try {
      const data = await getActivity();
      setAppointments(data.appointments);
      setEvents(data.events);
      setPending(data.pending_action);
      setNote(data.representatives?.note || null);
    } catch {
      /* Activity is optional when the voice APIs are down. */
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section id="appointments" className="rounded-3xl border border-line bg-paper p-6 md:p-8">
      <h2 className="text-2xl font-semibold tracking-tight">Requests and appointments</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Recorded specialist requests from chat, browser voice, and phone. A request is not a confirmed calendar booking unless a scheduling provider later confirms it.
      </p>
      {pending ? <div className="mt-4"><ConfirmActionCard action={pending} onDone={refresh} /></div> : null}
      {appointments.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No requests on this account yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {appointments.map((item) => (
            <li key={item.appointment_id} className="rounded-2xl border border-line px-4 py-3 text-sm">
              <div className="font-semibold">{item.category}</div>
              <div className="mt-1 text-muted">
                Status: {item.status}
                {item.preferred_when ? ` · Preferred: ${item.preferred_when}` : ""}
                {item.location_label ? ` · ${item.location_label}` : ""}
              </div>
              <div className="mt-1 text-xs text-muted">Email: {item.email_status} · Source: {item.source}</div>
            </li>
          ))}
        </ul>
      )}
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
