/**
 * Pure helpers for reconciling Retell / backend voice transcript snapshots into
 * stable chat caption messages (partial updates in place, interruption flags).
 */

export type CaptionRole = "user" | "assistant";

export interface VoiceCaption {
  id: string;
  callId: string;
  role: CaptionRole;
  text: string;
  isFinal: boolean;
  isSpeaking: boolean;
  interrupted?: boolean;
  timestamp: number;
  sequence: number;
}

export type ProviderTurn = {
  role: "user" | "agent";
  content: string;
  /** Optional stable id from the provider; falls back to callId-index. */
  id?: string;
};

export type ReconcileOptions = {
  agentSpeaking: boolean;
  /** Retell update.turntaking when present. */
  turntaking?: string;
  /** Monotonic event counter; stale lower values are ignored when they would shrink text. */
  eventSeq: number;
  now?: number;
};

function roleOf(role: "user" | "agent"): CaptionRole {
  return role === "user" ? "user" : "assistant";
}

function captionId(callId: string, index: number, turn?: ProviderTurn): string {
  if (turn?.id?.trim()) return `${callId}:${turn.id}`;
  return `${callId}:${index}`;
}

/**
 * Replace-by-identity merge of a full transcript snapshot.
 * Does not invent wording — only maps provider turns into caption rows.
 */
export function reconcileSnapshot(
  prev: VoiceCaption[],
  callId: string,
  turns: ProviderTurn[],
  opts: ReconcileOptions
): VoiceCaption[] {
  const now = opts.now ?? Date.now();
  const cleaned = turns
    .map((t) => ({ ...t, content: (t.content || "").trim() }))
    .filter((t) => t.content && (t.role === "user" || t.role === "agent"));

  if (!cleaned.length) {
    return prev.filter((c) => c.callId === callId);
  }

  const prevForCall = prev.filter((c) => c.callId === callId);
  const prevById = new Map(prevForCall.map((c) => [c.id, c]));
  const lastPrevSeq = prevForCall.reduce((m, c) => Math.max(m, c.sequence), 0);

  // Drop obviously stale snapshots that shrink content after a newer event.
  if (opts.eventSeq < lastPrevSeq) {
    const prevText = prevForCall.map((c) => c.text).join("\n");
    const nextText = cleaned.map((t) => t.content).join("\n");
    if (nextText.length < prevText.length) return prevForCall;
  }

  const next: VoiceCaption[] = cleaned.map((turn, index) => {
    const id = captionId(callId, index, turn);
    const existing = prevById.get(id) ?? prevForCall[index];
    const isLast = index === cleaned.length - 1;
    const role = roleOf(turn.role);

    let interrupted = existing?.interrupted === true;
    if (
      existing &&
      role === "assistant" &&
      existing.role === "assistant" &&
      existing.isSpeaking &&
      turn.content.length < existing.text.length &&
      !opts.agentSpeaking
    ) {
      interrupted = true;
    }

    // Partial user text only while Retell reports the user's turn is open.
    const userPartial = !interrupted && role === "user" && isLast && opts.turntaking === "user_turn";
    const speakingAgent = !interrupted && role === "assistant" && isLast && opts.agentSpeaking;

    return {
      id,
      callId,
      role,
      text: turn.content,
      isFinal: !userPartial && !speakingAgent,
      isSpeaking: speakingAgent,
      interrupted: interrupted || undefined,
      timestamp: existing?.timestamp ?? now,
      sequence: Math.max(opts.eventSeq, existing?.sequence ?? 0, index + 1),
    };
  });

  // Barge-in: new user turn after an agent that was still marked speaking.
  for (let i = 1; i < next.length; i++) {
    if (next[i].role !== "user" || next[i - 1].role !== "assistant") continue;
    const prior = prevById.get(next[i - 1].id) ?? prevForCall[i - 1];
    if (prior?.isSpeaking || next[i - 1].isSpeaking) {
      next[i - 1] = {
        ...next[i - 1],
        isSpeaking: false,
        isFinal: true,
        interrupted: true,
      };
    }
  }

  return next;
}

/** Apply agent talking state without inventing transcript text. */
export function applyAgentSpeaking(captions: VoiceCaption[], callId: string, speaking: boolean): VoiceCaption[] {
  let touched = false;
  const lastAssistantId = [...captions].reverse().find((x) => x.callId === callId && x.role === "assistant")?.id;

  const next = captions.map((c) => {
    if (c.callId !== callId || c.role !== "assistant") return c;
    if (c.id !== lastAssistantId) {
      if (!c.isSpeaking && c.isFinal) return c;
      touched = true;
      return { ...c, isSpeaking: false, isFinal: true };
    }
    if (speaking) {
      if (c.interrupted) return c;
      touched = true;
      return { ...c, isSpeaking: true, isFinal: false };
    }
    if (!c.isSpeaking && c.isFinal) return c;
    touched = true;
    return { ...c, isSpeaking: false, isFinal: true };
  });
  return touched ? next : captions;
}

/** Finalize every open caption when the call ends. */
export function finalizeCallCaptions(captions: VoiceCaption[], callId: string): VoiceCaption[] {
  return captions.map((c) => (c.callId === callId ? { ...c, isSpeaking: false, isFinal: true } : c));
}
