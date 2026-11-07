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

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const { data } = await apiClient.get<{ status: string }>("/api/health/");
    return data.status === "ok";
  } catch {
    return false;
  }
}
