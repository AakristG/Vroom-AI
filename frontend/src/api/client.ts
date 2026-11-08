import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 8000,
});

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** POST /api/ai/chat/ — Nemotron on the Django backend, grounded in one customer when customerId is set. */
export async function sendChatMessage(messages: ChatMessage[], customerId?: string): Promise<string> {
  const { data } = await apiClient.post<{ reply: string }>("/api/ai/chat/", {
    customer_id: customerId,
    messages,
  });
  return data.reply;
}

export interface AssistantTool {
  name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export type AssistantAction =
  | { type: "navigate"; label: string; to: string }
  | { type: "confirm"; action: "request_callback"; topic: string; label: string };

export interface AssistantContext {
  page: string;
  vehicles?: string[];
  year?: number;
}

export interface AssistantResponse {
  reply: string | null;
  detail?: string;
  tools: AssistantTool[];
  actions: AssistantAction[];
}

/** POST /api/ai/assistant/ — Nemotron grounded in backend tool results for this page. */
export async function sendAssistantMessage(
  messages: ChatMessage[],
  context: AssistantContext,
  customerId?: string | null
): Promise<AssistantResponse> {
  try {
    const { data } = await apiClient.post<AssistantResponse>(
      "/api/ai/assistant/",
      { messages, context, customer_id: customerId ?? undefined },
      { timeout: 60000 }
    );
    return data;
  } catch (err) {
    const body = (err as { response?: { status?: number; data?: AssistantResponse } }).response;
    if (body?.status === 503 && body.data) return { ...body.data, reply: null };
    throw err;
  }
}

export async function requestCallback(payload: { customer_id: string; name: string; topic: string; when: string; phone: string }) {
  const { data } = await apiClient.post("/api/voice/appointments/", payload, { timeout: 20000 });
  return data as { appointment: Record<string, string>; call: { status: string } };
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const { data } = await apiClient.get<{ status: string }>("/api/health/");
    return data.status === "ok";
  } catch {
    return false;
  }
}
