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

const customerEvent = table(
  {
    name: 'customer_event',
    public: true,
    indexes: [{ accessor: 'byCustomer', algorithm: 'btree', columns: ['customerId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    customerId: t.string(),
    eventType: t.string(),
    payload: t.string(),
    createdAt: t.string(),
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

/** Which signed-in customer a call belongs to, so each browser only shows its own transcript. */
const callOwner = table(
  {
    name: 'call_owner',
    public: true,
    indexes: [{ accessor: 'byCustomer', algorithm: 'btree', columns: ['customerId'] }],
  },
  {
    callId: t.string().primaryKey(),
    customerId: t.string(),
    channel: t.string(), // "web" | "phone"
    fromNumber: t.string(),
    startedAt: t.string(), // ISO-8601
  }
);

/** One step of a customer's AI-automated "next moves" plan. The backend writes progress as the
 * assistant works through the steps; every open browser for that customer sees it live. */
const nextMove = table(
  {
    name: 'next_move',
    public: true,
    indexes: [{ accessor: 'byCustomer', algorithm: 'btree', columns: ['customerId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    customerId: t.string(),
    stepKey: t.string(),
    position: t.u32(),
    title: t.string(),
    detail: t.string(),
    status: t.string(), // "working" | "done" | "needs_you" | "blocked"
    actionLabel: t.string(),
    actionJson: t.string(), // the suggested action, as JSON; "" when there is none
    updatedAt: t.string(), // ISO-8601
  }
);

const spacetimedb = schema({
  call_session: callSession,
  call_message: callMessage,
  appointment,
  customer_event: customerEvent,
  call_owner: callOwner,
  next_move: nextMove,
});
export default spacetimedb;

/** Record which customer (if any) a call belongs to. */
export const setCallOwner = spacetimedb.reducer(
  {
    callId: t.string(),
    customerId: t.string(),
    channel: t.string(),
    fromNumber: t.string(),
    startedAt: t.string(),
  },
  (ctx, { callId, customerId, channel, fromNumber, startedAt }) => {
    const existing = ctx.db.call_owner.callId.find(callId);
    if (existing) {
      existing.customerId = customerId || existing.customerId;
      existing.channel = channel || existing.channel;
      existing.fromNumber = fromNumber || existing.fromNumber;
      ctx.db.call_owner.callId.update(existing);
    } else {
      ctx.db.call_owner.insert({ callId, customerId, channel, fromNumber, startedAt });
    }
  }
);

/** Create or update one next-move step, keyed by (customerId, stepKey). */
export const upsertNextMove = spacetimedb.reducer(
  {
    customerId: t.string(),
    stepKey: t.string(),
    position: t.u32(),
    title: t.string(),
    detail: t.string(),
    status: t.string(),
    actionLabel: t.string(),
    actionJson: t.string(),
    updatedAt: t.string(),
  },
  (ctx, args) => {
    for (const row of ctx.db.next_move.byCustomer.filter(args.customerId)) {
      if (row.stepKey === args.stepKey) {
        ctx.db.next_move.id.update({ ...row, ...args });
        return;
      }
    }
    ctx.db.next_move.insert({ id: 0n, ...args });
  }
);

/** Drop a customer's plan before the assistant writes a fresh one. */
export const clearNextMoves = spacetimedb.reducer({ customerId: t.string() }, (ctx, { customerId }) => {
  for (const row of [...ctx.db.next_move.byCustomer.filter(customerId)]) {
    ctx.db.next_move.id.delete(row.id);
  }
});

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

export const appendCustomerEvent = spacetimedb.reducer(
  {
    customerId: t.string(),
    eventType: t.string(),
    payload: t.string(),
    createdAt: t.string(),
  },
  (ctx, { customerId, eventType, payload, createdAt }) => {
    ctx.db.customer_event.insert({ id: 0n, customerId, eventType, payload, createdAt });
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
