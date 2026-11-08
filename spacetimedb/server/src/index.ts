/**
 * SpacetimeDB module: real-time call/session state for the Toyota Financial Services
 * voice assistant.
 *
 * This module is published independently (see ../README.md) -- it does not import anything
 * from backend/ or frontend/, and they only talk to it over the network.
 *
 * Syntax reference: https://spacetimedb.com/docs/databases/cheat-sheet
 */
import { schema, table, t } from 'spacetimedb/server';

const callSession = table(
  { name: 'call_session', public: true },
  {
    callId: t.string().primaryKey(),
    agentId: t.string(),
    status: t.string(), // "registered" | "ongoing" | "ended" | "analyzed"
    lastSpeaker: t.string(), // "agent" | "user" | ""
    updatedAt: t.string(), // ISO-8601, set by the caller (backend or frontend)
  }
);

const callMessage = table(
  {
    name: 'call_message',
    public: true,
    indexes: [{ accessor: 'byCall', algorithm: 'btree', columns: ['callId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    callId: t.string(),
    role: t.string(), // "agent" | "user"
    content: t.string(),
    createdAt: t.string(), // ISO-8601
  }
);

const appointment = table(
  { name: 'appointment', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    customerId: t.string(),
    name: t.string(),
    topic: t.string(),
    whenText: t.string(),
    phone: t.string(),
    status: t.string(),
  }
);

const spacetimedb = schema({
  call_session: callSession,
  call_message: callMessage,
  appointment,
});
export default spacetimedb;

/** Create or update the row for a call. Called from the backend on webhook events, and from
 * the Retell WS consumer as the call progresses. */
export const upsertCallSession = spacetimedb.reducer(
  {
    callId: t.string(),
    agentId: t.string(),
    status: t.string(),
    lastSpeaker: t.string(),
    updatedAt: t.string(),
  },
  (ctx, { callId, agentId, status, lastSpeaker, updatedAt }) => {
    const existing = ctx.db.call_session.callId.find(callId);
    if (existing) {
      existing.agentId = agentId;
      existing.status = status;
      existing.lastSpeaker = lastSpeaker;
      existing.updatedAt = updatedAt;
      ctx.db.call_session.callId.update(existing);
    } else {
      ctx.db.call_session.insert({ callId, agentId, status, lastSpeaker, updatedAt });
    }
  }
);

/** Append one transcript turn for a call. Called as the live transcript grows. */
export const appendCallMessage = spacetimedb.reducer(
  {
    callId: t.string(),
    role: t.string(),
    content: t.string(),
    createdAt: t.string(),
  },
  (ctx, { callId, role, content, createdAt }) => {
    ctx.db.call_message.insert({ id: 0n, callId, role, content, createdAt });
  }
);

/** A scheduled conversation with a representative. The website reads this live. */
export const bookAppointment = spacetimedb.reducer(
  {
    customerId: t.string(),
    name: t.string(),
    topic: t.string(),
    whenText: t.string(),
    phone: t.string(),
    status: t.string(),
  },
  (ctx, { customerId, name, topic, whenText, phone, status }) => {
    ctx.db.appointment.insert({ id: 0n, customerId, name, topic, whenText, phone, status });
  }
);
