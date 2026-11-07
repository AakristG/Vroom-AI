import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Hits POST /api/ai/chat/ — a way to test the NVIDIA NIM integration without a live Retell call. */
export async function sendChatMessage(messages: ChatMessage[]): Promise<string> {
  const { data } = await apiClient.post<{ reply: string }>("/api/ai/chat/", { messages });
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
