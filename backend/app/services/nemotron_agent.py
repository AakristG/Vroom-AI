import os
import json
from typing import List, Dict, Any
from openai import AsyncOpenAI
from app.services.tfs_engine import tfs_engine

def get_nemotron_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        base_url="https://integrate.api.nvidia.com/v1",
        api_key=os.getenv("NVIDIA_API_KEY", "missing-key")
    )

AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "fetch_verified_tfs_scenarios",
            "description": "Step 1: Fetch the logged-in customer's verified Toyota Financial Services contract, vehicle equity, compliance guardrails, and precomputed option scenarios.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {"type": "string"},
                    "detected_intent": {"type": "string"}
                },
                "required": ["customer_id", "detected_intent"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "publish_decision_workspace_to_ui",
            "description": "Step 2: Push the verified best next move and 1-2 alternative options directly onto the customer's interactive UI dashboard (via SpacetimeDB state sync) so they can compare trade-offs and choose.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {"type": "string"},
                    "best_option_id": {"type": "string"},
                    "alternative_option_ids": {"type": "array", "items": {"type": "string"}},
                    "next_step_type": {"type": "string", "enum": ["Self-service", "Follow-up", "Offer"]},
                    "stated_assumptions": {"type": "string"}
                },
                "required": ["customer_id", "best_option_id", "alternative_option_ids", "next_step_type", "stated_assumptions"]
            }
        }
    }
]

async def run_nemotron_agent_turn(customer_id: str, conversation_history: List[Dict[str, str]]) -> Dict[str, Any]:
    bundle = tfs_engine.evaluate_customer_guardrails_and_options(customer_id)
    if "error" in bundle:
        return {"reply": bundle["error"], "ui_state": None}

    api_key = os.getenv("NVIDIA_API_KEY", "")
    if not api_key or api_key == "nvapi-your-key-here":
        eligible_opts = [o for o in bundle["verified_options"] if o["eligible"]]
        best = next((o for o in eligible_opts if o["option_id"] != "KEEP"), eligible_opts[0] if eligible_opts else bundle["verified_options"][0])
        alts = [o for o in eligible_opts if o["option_id"] != best["option_id"]][:2]
        ui_payload = {
            "customer_id": customer_id,
            "best_option": best,
            "alternatives": alts,
            "guardrails_triggered": bundle["active_guardrails"],
            "next_step_type": best["next_step_type"],
            "stated_assumptions": best["key_assumption"]
        }
        tfs_engine.active_ui_state[customer_id] = ui_payload
        return {
            "reply": (
                f"I've pulled up your verified Toyota Financial Services numbers and displayed them on your screen. "
                f"Your strongest option is {best['option_name']}: {best['plain_language_summary']} "
                f"Assumption: {best['key_assumption']} Trade-off: {best['tradeoff']} "
                f"Recommended next step: {best['next_step_type']}."
            ),
            "ui_state": ui_payload,
            "agent_steps": ["fetch_verified_tfs_scenarios", "publish_decision_workspace_to_ui"]
        }

    client = get_nemotron_client()
    model = os.getenv("NVIDIA_MODEL", "nvidia/llama-3.1-nemotron-70b-instruct")

    system_instructions = (
        f"{tfs_engine.starter_prompt}\n\n"
        f"CURRENT LOGGED-IN CUSTOMER ID: {customer_id}\n"
        "IMPORTANT MULTI-STEP AGENT INSTRUCTIONS:\n"
        "1. Always call `fetch_verified_tfs_scenarios` first to retrieve exact numbers and compliance flags.\n"
        "2. Then call `publish_decision_workspace_to_ui` to push the verified options to the customer's screen.\n"
        "3. Speak in 3-4 concise, empathetic sentences suitable for voice output."
    )

    messages: List[Dict[str, Any]] = [{"role": "system", "content": system_instructions}] + conversation_history
    agent_steps_taken = []

    for _ in range(3):
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            tools=AGENT_TOOLS,
            tool_choice="auto",
            temperature=0.1
        )
        msg = response.choices[0].message

        if not msg.tool_calls:
            return {
                "reply": msg.content or "",
                "ui_state": tfs_engine.active_ui_state.get(customer_id),
                "agent_steps": agent_steps_taken
            }

        messages.append(msg.model_dump(exclude_none=True))

        for tool_call in msg.tool_calls:
            fn_name = tool_call.function.name
            args = json.loads(tool_call.function.arguments or "{}")
            agent_steps_taken.append(fn_name)

            if fn_name == "fetch_verified_tfs_scenarios":
                tool_result = bundle
            elif fn_name == "publish_decision_workspace_to_ui":
                opts_by_id = {o["option_id"]: o for o in bundle["verified_options"]}
                best_opt = opts_by_id.get(args.get("best_option_id")) or bundle["verified_options"][0]
                alt_opts = [opts_by_id[oid] for oid in args.get("alternative_option_ids", []) if oid in opts_by_id]
                ui_payload = {
                    "customer_id": customer_id,
                    "best_option": best_opt,
                    "alternatives": alt_opts,
                    "guardrails_triggered": bundle["active_guardrails"],
                    "next_step_type": args.get("next_step_type", best_opt["next_step_type"]),
                    "stated_assumptions": args.get("stated_assumptions", best_opt["key_assumption"])
                }
                tfs_engine.active_ui_state[customer_id] = ui_payload
                tool_result = {"status": "published_to_spacetimedb_and_ui"}
            else:
                tool_result = {"error": "Unknown tool"}

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "name": fn_name,
                "content": json.dumps(tool_result)
            })

    final_resp = await client.chat.completions.create(model=model, messages=messages, temperature=0.1)
    return {
        "reply": final_resp.choices[0].message.content or "",
        "ui_state": tfs_engine.active_ui_state.get(customer_id),
        "agent_steps": agent_steps_taken
    }