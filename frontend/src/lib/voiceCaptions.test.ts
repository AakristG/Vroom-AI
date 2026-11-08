import { describe, expect, it } from "vitest";
import { applyAgentSpeaking, finalizeCallCaptions, reconcileSnapshot } from "./voiceCaptions";

describe("reconcileSnapshot", () => {
  it("updates a partial user utterance in place", () => {
    const callId = "call_1";
    const first = reconcileSnapshot([], callId, [{ role: "user", content: "What about" }], {
      agentSpeaking: false,
      turntaking: "user_turn",
      eventSeq: 1,
      now: 1000,
    });
    expect(first).toHaveLength(1);
    expect(first[0].text).toBe("What about");
    expect(first[0].isFinal).toBe(false);
    expect(first[0].id).toBe("call_1:0");

    const second = reconcileSnapshot(first, callId, [{ role: "user", content: "What about refinancing?" }], {
      agentSpeaking: false,
      turntaking: "user_turn",
      eventSeq: 2,
      now: 1100,
    });
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].text).toBe("What about refinancing?");
  });

  it("marks interrupted agent captions when the user barges in", () => {
    const callId = "call_2";
    let caps = reconcileSnapshot([], callId, [{ role: "agent", content: "Based on your loan, you may be able to" }], {
      agentSpeaking: true,
      turntaking: "agent_turn",
      eventSeq: 1,
      now: 1000,
    });
    caps = applyAgentSpeaking(caps, callId, true);
    expect(caps[0].isSpeaking).toBe(true);

    caps = reconcileSnapshot(
      caps,
      callId,
      [
        { role: "agent", content: "Based on your loan, you may be able to" },
        { role: "user", content: "Wait, what about refinancing?" },
      ],
      { agentSpeaking: false, turntaking: "user_turn", eventSeq: 2, now: 2000 }
    );
    expect(caps).toHaveLength(2);
    expect(caps[0].interrupted).toBe(true);
    expect(caps[0].isSpeaking).toBe(false);
    expect(caps[1].role).toBe("user");
    expect(caps[1].text).toBe("Wait, what about refinancing?");
  });

  it("does not duplicate bubbles when the same snapshot repeats", () => {
    const callId = "call_3";
    const turns = [
      { role: "agent" as const, content: "Hi there." },
      { role: "user" as const, content: "Hello." },
    ];
    const a = reconcileSnapshot([], callId, turns, { agentSpeaking: false, eventSeq: 1, now: 1 });
    const b = reconcileSnapshot(a, callId, turns, { agentSpeaking: false, eventSeq: 2, now: 2 });
    expect(b).toHaveLength(2);
    expect(b.map((c) => c.id)).toEqual(a.map((c) => c.id));
  });

  it("finalizes captions when the call ends", () => {
    const callId = "call_4";
    let caps = reconcileSnapshot([], callId, [{ role: "agent", content: "Thanks for calling." }], {
      agentSpeaking: true,
      eventSeq: 1,
      now: 1,
    });
    caps = applyAgentSpeaking(caps, callId, true);
    caps = finalizeCallCaptions(caps, callId);
    expect(caps[0].isSpeaking).toBe(false);
    expect(caps[0].isFinal).toBe(true);
  });
});
