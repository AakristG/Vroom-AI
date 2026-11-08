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

/** Website chat with Vroom AI, one row per message. The backend writes both sides of each turn so
 * every tab and device signed in as this customer shows the same conversation. */
const assistantTurn = table(
  {
    name: 'assistant_turn',
    public: true,
    indexes: [{ accessor: 'byCustomer', algorithm: 'btree', columns: ['customerId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    customerId: t.string(),
    turnId: t.string(), // client- or server-generated id, used to merge with optimistic local turns
    role: t.string(), // "user" | "assistant"
    content: t.string(),
    toolsJson: t.string(), // backend tool results, as JSON ("" when none)
    actionsJson: t.string(), // suggested actions, as JSON ("" when none)
    offline: t.bool(), // true when Nemotron was unavailable and only tool results came back
    createdAt: t.string(), // ISO-8601
  }
);

/** The What-if dashboard settings the agent last chose for a customer (chat or voice call).
 * `revision` increases on every change so each browser applies a command exactly once. */
const dashboardState = table(
  { name: 'dashboard_state', public: true },
  {
    customerId: t.string().primaryKey(),
    simulatorJson: t.string(), // {"extra_monthly": n, "lump_sum": n} or ""
    scenarioJson: t.string(), // {"extend_months": n} or ""
    source: t.string(), // "web" | "voice" | "phone"
    revision: t.u64(),
    updatedAt: t.string(),
  }
);

/** Vehicles a customer has picked on the Compare page, synced across tabs and devices. */
const compareSelection = table(
  { name: 'compare_selection', public: true },
  {
    customerId: t.string().primaryKey(),
    idsJson: t.string(), // JSON array of "year|model|trim" ids
    updatedAt: t.string(),
  }
);

/** The three models Nemotron suggested for the customer's current Compare selection. */
const compareSuggestion = table(
  { name: 'compare_suggestion', public: true },
  {
    customerId: t.string().primaryKey(),
    selectionKey: t.string(), // which selection these suggestions were made for
    suggestionsJson: t.string(),
    source: t.string(), // "nemotron" | "ranked" | "none"
    updatedAt: t.string(),
  }
);

/** Latest live-caption snapshot for a voice call (interim text included), pushed by the backend. */
const voiceCaption = table(
  {
    name: 'voice_caption',
    public: true,
    indexes: [{ accessor: 'byCustomer', algorithm: 'btree', columns: ['customerId'] }],
  },
  {
    callId: t.string().primaryKey(),
    customerId: t.string(),
    status: t.string(),
    turnsJson: t.string(), // JSON array of {role, content, ...} caption turns
    sequence: t.u64(),
    updatedAt: t.string(),
  }
);

const spacetimedb = schema({
  call_session: callSession,
  call_message: callMessage,
  appointment,
  customer_event: customerEvent,
  call_owner: callOwner,
  next_move: nextMove,
  assistant_turn: assistantTurn,
  dashboard_state: dashboardState,
  compare_selection: compareSelection,
  compare_suggestion: compareSuggestion,
  voice_caption: voiceCaption,
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

/** Append one chat message. Called by the backend for both the customer's message and the reply. */
export const appendAssistantTurn = spacetimedb.reducer(
  {
    customerId: t.string(),
    turnId: t.string(),
    role: t.string(),
    content: t.string(),
    toolsJson: t.string(),
    actionsJson: t.string(),
    offline: t.bool(),
    createdAt: t.string(),
  },
  (ctx, args) => {
    for (const row of ctx.db.assistant_turn.byCustomer.filter(args.customerId)) {
      if (row.turnId === args.turnId) return; // retries must not duplicate a message
    }
    ctx.db.assistant_turn.insert({ id: 0n, ...args });
  }
);

/** "Clear" in the chat: drop this customer's conversation everywhere. */
export const clearAssistantTurns = spacetimedb.reducer({ customerId: t.string() }, (ctx, { customerId }) => {
  for (const row of [...ctx.db.assistant_turn.byCustomer.filter(customerId)]) {
    ctx.db.assistant_turn.id.delete(row.id);
  }
});

/** The agent moved the What-if dashboard. Each command holds only the parts it changes ("" = untouched). */
export const setDashboard = spacetimedb.reducer(
  {
    customerId: t.string(),
    simulatorJson: t.string(),
    scenarioJson: t.string(),
    source: t.string(),
    updatedAt: t.string(),
  },
  (ctx, { customerId, simulatorJson, scenarioJson, source, updatedAt }) => {
    const existing = ctx.db.dashboard_state.customerId.find(customerId);
    if (existing) {
      ctx.db.dashboard_state.customerId.update({
        customerId,
        simulatorJson,
        scenarioJson,
        source,
        revision: existing.revision + 1n,
        updatedAt,
      });
    } else {
      ctx.db.dashboard_state.insert({ customerId, simulatorJson, scenarioJson, source, revision: 1n, updatedAt });
    }
  }
);

/** Save the Compare page selection for a customer. */
export const setCompareSelection = spacetimedb.reducer(
  { customerId: t.string(), idsJson: t.string(), updatedAt: t.string() },
  (ctx, { customerId, idsJson, updatedAt }) => {
    const existing = ctx.db.compare_selection.customerId.find(customerId);
    if (existing) ctx.db.compare_selection.customerId.update({ customerId, idsJson, updatedAt });
    else ctx.db.compare_selection.insert({ customerId, idsJson, updatedAt });
  }
);

/** Store the AI suggestions for a customer's current Compare selection. */
export const setCompareSuggestions = spacetimedb.reducer(
  { customerId: t.string(), selectionKey: t.string(), suggestionsJson: t.string(), source: t.string(), updatedAt: t.string() },
  (ctx, args) => {
    const existing = ctx.db.compare_suggestion.customerId.find(args.customerId);
    if (existing) ctx.db.compare_suggestion.customerId.update(args);
    else ctx.db.compare_suggestion.insert(args);
  }
);

/** Replace the live-caption snapshot for a call. Older sequences are ignored. */
export const upsertVoiceCaption = spacetimedb.reducer(
  { callId: t.string(), customerId: t.string(), status: t.string(), turnsJson: t.string(), sequence: t.u64(), updatedAt: t.string() },
  (ctx, args) => {
    const existing = ctx.db.voice_caption.callId.find(args.callId);
    if (!existing) {
      ctx.db.voice_caption.insert(args);
      return;
    }
    if (args.sequence < existing.sequence) return;
    ctx.db.voice_caption.callId.update({ ...args, customerId: args.customerId || existing.customerId });
  }
);
