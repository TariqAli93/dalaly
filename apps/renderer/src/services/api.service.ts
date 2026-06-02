const configuredApiBase = import.meta.env.VITE_API_BASE_URL as
  | string
  | undefined;

/**
 * مهم: لا تستخدم أكثر من API base أثناء التشغيل.
 * fallback بين ports أثناء PATCH/PUT/POST/DELETE يسبب مشاكل CORS و 400/500.
 */
export const API_BASE =
  configuredApiBase?.replace(/\/$/, "") || "http://127.0.0.1:45678/api";

const SESSION_KEY = "dalaly.session";

let token = localStorage.getItem(SESSION_KEY) ?? "";
let onUnauthorized: (() => void) | null = null;

export function getToken() {
  return token;
}

export function setToken(value: string) {
  token = value;
  localStorage.setItem(SESSION_KEY, value);
}

export function clearToken() {
  token = "";
  localStorage.removeItem(SESSION_KEY);
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

function buildRequest(init: RequestInit, authenticated: boolean) {
  const headers = new Headers(init.headers);

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (authenticated && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return { ...init, headers };
}

async function parseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export function formatApiError(body: unknown) {
  if (body && typeof body === "object") {
    const payload = body as {
      message?: string;
      error?: string;
      issues?: Array<{ message: string }>;
    };

    if (payload.issues?.length) {
      return payload.issues.map((issue) => issue.message).join("، ");
    }

    if (payload.message) return payload.message;
    if (payload.error) return payload.error;
  }

  return "تعذر تنفيذ العملية.";
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "حدث خطأ غير متوقع.";
}

/** طلب عام لا يتطلب توكن (الصحة، الإعداد، تسجيل الدخول). */
export async function publicRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, buildRequest(init, false));
  const body = await parseBody(response);

  if (!response.ok) {
    throw new Error(formatApiError(body));
  }

  return body as T;
}

/** طلب يتطلب توكن المصادقة. يعالج 401 مركزياً. */
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, buildRequest(init, true));
  const body = await parseBody(response);

  if (response.status === 401) {
    clearToken();
    onUnauthorized?.();
  }

  if (!response.ok) {
    throw new Error(formatApiError(body));
  }

  return body as T;
}
