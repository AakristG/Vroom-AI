import os
from typing import List, Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from retell import Retell

from app.services.tfs_engine import tfs_engine
from app.services.nemotron_agent import run_nemotron_agent_turn

load_dotenv()

app = FastAPI(title="Toyota Financial Services - Smartest Next Move API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    customer_id: str = "C001"
    message: str
    history: List[Dict[str, str]] = []

@app.get("/api/health")
async def health():
    return {"status": "ok", "customers_loaded": len(tfs_engine.tables.get("customers", []))}

@app.get("/api/customers")
async def list_customers():
    return tfs_engine.get_all_customers_summary()

@app.get("/api/customers/{customer_id}")
async def get_customer_dashboard(customer_id: str):
    data = tfs_engine.evaluate_customer_guardrails_and_options(customer_id)
    data["active_ui_workspace"] = tfs_engine.active_ui_state.get(customer_id)
    return data

@app.post("/api/chat")
async def chat_with_advisor(req: ChatRequest):
    history = req.history + [{"role": "user", "content": req.message}]
    return await run_nemotron_agent_turn(req.customer_id, history)

@app.post("/api/retell/create-web-call")
async def create_retell_web_call(customer_id: str = "C001"):
    retell_key = os.getenv("RETELL_API_KEY", "")
    agent_id = os.getenv("RETELL_AGENT_ID", "")
    if not retell_key or not agent_id:
        return {"error": "Set RETELL_API_KEY and RETELL_AGENT_ID in backend/.env"}
    client = Retell(api_key=retell_key)
    web_call = client.call.create_web_call(
        agent_id=agent_id,
        metadata={"customer_id": customer_id}
    )
    return {"access_token": web_call.access_token, "call_id": web_call.call_id}

@app.websocket("/llm-websocket/{call_id}")
async def retell_llm_websocket(websocket: WebSocket, call_id: str):
    await websocket.accept()
    customer_id = "C001"

    await websocket.send_json({
        "response_type": "config",
        "config": {"auto_reconnect": True, "call_details": True}
    })

    try:
        while True:
            request = await websocket.receive_json()
            interaction_type = request.get("interaction_type")

            if interaction_type == "call_details":
                meta = request.get("call", {}).get("metadata", {})
                customer_id = meta.get("customer_id", "C001")
                bundle = tfs_engine.evaluate_customer_guardrails_and_options(customer_id)
                first_name = bundle.get("customer", {}).get("first_name", "there")
                model = bundle.get("vehicle", {}).get("model", "Toyota")
                await websocket.send_json({
                    "response_type": "response",
                    "response_id": 0,
                    "content": f"Hi {first_name}, I have your {model} account pulled up. Tell me what's going on today, and we'll look at your verified options together.",
                    "content_complete": True
                })

            elif interaction_type == "ping_pong":
                await websocket.send_json({"response_type": "ping_pong", "timestamp": request["timestamp"]})

            elif interaction_type in ["response_required", "reminder_required"]:
                response_id = request["response_id"]
                transcript = request.get("transcript", [])
                history = [
                    {"role": "assistant" if t["role"] == "agent" else "user", "content": t["content"]}
                    for t in transcript
                ]
                result = await run_nemotron_agent_turn(customer_id, history)
                await websocket.send_json({
                    "response_type": "response",
                    "response_id": response_id,
                    "content": result["reply"],
                    "content_complete": True
                })
    except WebSocketDisconnect:
        print(f"Retell Call {call_id} disconnected")