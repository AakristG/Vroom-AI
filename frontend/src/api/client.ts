import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const TOKEN_KEY = "tfs-token";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 8000,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = String(error.config?.url || "");
    const status = error.response?.status;
    if (status === 401 && !url.includes("/api/auth/login") && !url.includes("/api/auth/signup")) {
      sessionStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("tfs-auth-logout"));
    }
    return Promise.reject(error);
  }
);

export interface AuthAccount {
  token: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  life_change: string;
  preferences: string;
  customer_id: string;
  current_payment: number | null;
  vehicle_model: string;
  vehicle_year: number | null;
  /** Loan or lease terms the customer typed. Empty when none were entered. Never verified. */
  agreement: SelfReportedAgreement | Record<string, never>;
}

export type SelfReportedAgreement =
  | { contract_type: "loan"; payment_due_day: number; current_balance: number; apr: number }
  | {
      contract_type: "lease";
      payment_due_day: number;
      months_remaining: number;
      residual_value?: number;
      mileage_allowance_total?: number;
      odometer_now?: number;
    };

export const hasAgreement = (a: AuthAccount["agreement"] | undefined): a is SelfReportedAgreement => Boolean(a && "contract_type" in a);

export interface SignupInput {
  first_name: string;
  last_name: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  life_change: string;
  current_payment: string;
  vehicle_model: string;
  vehicle_year: string;
}

function remember(account: AuthAccount) {
  sessionStorage.setItem(TOKEN_KEY, account.token);
  return account;
}

export async function login(username: string, password: string) {
  const { data } = await apiClient.post<AuthAccount>("/api/auth/login/", { username, password }, { timeout: 20000 });
  return remember(data);
}

export async function signup(input: SignupInput) {
  const { data } = await apiClient.post<AuthAccount>("/api/auth/signup/", input);
  return remember(data);
}

export async function getMe() {
  const { data } = await apiClient.get<AuthAccount>("/api/auth/me/");
  return data;
}

export async function logout() {
  try {
    await apiClient.post("/api/auth/logout/");
  } catch {
    /* Local state is still cleared by the caller. */
  }
  sessionStorage.removeItem(TOKEN_KEY);
}

export interface AccountPatch extends Partial<Pick<AuthAccount, "life_change" | "preferences" | "city" | "phone">> {
  current_payment?: string;
  /** Raw form values; the backend validates them. `null` clears the agreement. */
  agreement?: Record<string, string> | null;
}

export async function updateAccount(patch: AccountPatch) {
  const { data } = await apiClient.patch<AuthAccount>("/api/auth/me/", patch);
  if (data.token) sessionStorage.setItem(TOKEN_KEY, data.token);
  return data;
}

export function isUnauthorized(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

export function apiError(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail) return detail;
    if (!error.response) return "The server didn't answer. Check that the backend is running and try again.";
  }
  return fallback;
}

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
