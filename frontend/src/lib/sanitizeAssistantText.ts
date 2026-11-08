/** Strip leaked pending-action JSON from assistant prose (defense in depth). */
const INTERNAL = /action_id|pending_action|awaiting_final_confirmation|awaiting_intent_confirmation|expires_at/i;

export function sanitizeAssistantText(text: string): string {
  if (!text) return text;
  let out = text.replace(/```[\s\S]*?```/g, " ");
  let changed = true;
  while (changed) {
    changed = false;
    out = out.replace(/\{[^{}]*\}/g, (chunk) => {
      if (!INTERNAL.test(chunk)) return chunk;
      changed = true;
      return " ";
    });
  }
  out = out.replace(/\s{2,}/g, " ").trim();
  return INTERNAL.test(out) ? "" : out;
}
