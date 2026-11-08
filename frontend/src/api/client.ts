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
  | { type: "confirm"; action: "request_callback"; topic: string; label: string }
  | PendingActionCard;

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
  return data as { appointment: Record<string, string> | null; action?: PendingActionCard; call: { status: string } };
}

export interface PendingActionCard {
  action_id: string;
  type: "pending_action";
  action_type: string;
  status: string;
  summary: string;
  stage: "intent" | "final" | string;
  label: string;
  expires_at: string;
  result?: Record<string, unknown> | null;
  payload?: Record<string, unknown>;
}

export interface AppointmentRecord {
  appointment_id: string;
  category: string;
  status: string;
  preferred_when?: string;
  location_label?: string;
  representative_label?: string;
  email_status: string;
  source: string;
  created_at: string;
}

export interface CustomerTimelineEvent {
  event_id: string;
  type: string;
  channel: string;
  payload?: Record<string, unknown>;
  occurred_at: string;
}

export interface ActivitySnapshot {
  appointments: AppointmentRecord[];
  events: CustomerTimelineEvent[];
  pending_action: PendingActionCard | null;
  representatives?: { configured?: boolean; note?: string; results?: unknown[] };
}

export async function getActivity(zip?: string): Promise<ActivitySnapshot> {
  const { data } = await apiClient.get<ActivitySnapshot>("/api/voice/activity/", {
    params: zip ? { zip } : undefined,
    timeout: 15000,
  });
  return data;
}

export async function confirmPendingAction(actionId: string, stage: "intent" | "execute" | "cancel") {
  const { data } = await apiClient.post<{ action: PendingActionCard }>(
    "/api/voice/actions/confirm/",
    { action_id: actionId, stage },
    { timeout: 20000 }
  );
  return data.action;
}

/** Server-minted Retell web call (v3). Keeps RETELL_API_KEY off the browser and marks the session verified. */
export async function createVerifiedWebCall() {
  try {
    const { data } = await apiClient.post<{
      access_token: string;
      call_id: string;
      transport?: string;
      ice_servers?: RTCIceServer[];
      expires_at?: number;
      configured: boolean;
      detail?: string;
    }>("/api/voice/web-call/", {}, { timeout: 20000 });
    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const detail = error.response?.data?.detail;
      if (typeof detail === "string" && detail.trim()) throw new Error(detail);
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error("Sign in to start a browser voice call.");
      }
      if (error.response?.status === 503) {
        throw new Error("Voice calling is not configured on the server yet.");
      }
      if (error.code === "ECONNABORTED") throw new Error("The voice server timed out. Try again.");
      if (!error.response) throw new Error("Could not reach the voice server. Check that the backend is running.");
    }
    throw error instanceof Error ? error : new Error("Could not start the voice call.");
  }
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const { data } = await apiClient.get<{ status: string }>("/api/health/");
    return data.status === "ok";
  } catch {
    return false;
  }
}
