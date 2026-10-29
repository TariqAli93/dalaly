import type { ApiErrorBody } from "../types";

const configuredApiBase = import.meta.env.VITE_API_BASE_URL as
  string | undefined;

/**
 * مهم: لا تستخدم أكثر من API base أثناء التشغيل.
 * fallback بين ports أثناء PATCH/PUT/POST/DELETE يسبب مشاكل CORS و 400/500.
 */
export const API_BASE =
  configuredApiBase?.replace(/\/$/, "") || "http://127.0.0.1:34567/api";

const SESSION_KEY = "dalaly.session";
const MEDIA_KEY = "dalaly.media";

let token = localStorage.getItem(SESSION_KEY) ?? "";
/**
 * رمز روابط الصور: مشتق من الجلسة ويبطل معها، ولا يقبله الخادم إلا لقراءة
 * صورة أو مصغّرة أو الشعار. رمز الجلسة نفسه لا يوضع في رابط أبداً.
 */
let mediaToken = localStorage.getItem(MEDIA_KEY) ?? "";
let onUnauthorized: (() => void) | null = null;

export function getToken() {
  return token;
}

export function setToken(value: string, media: string) {
  token = value;
  localStorage.setItem(SESSION_KEY, value);
  setMediaToken(media);
}

export function setMediaToken(value: string) {
  mediaToken = value;
  localStorage.setItem(MEDIA_KEY, value);
}

/** رابط ملف يُعرض في <img>: المسار مع رمز الوسائط. */
export function mediaUrl(path: string) {
  return `${API_BASE}${path}?media=${encodeURIComponent(mediaToken)}`;
}

export function clearToken() {
  token = "";
  mediaToken = "";
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(MEDIA_KEY);
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
    const payload = body as Partial<ApiErrorBody> & { error?: string };

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

export class ApiError extends Error {
  /** The body's machine-readable `code`, e.g. "BACKUP_PASSWORD_REQUIRED". */
  readonly code: string | undefined;
  readonly issues: NonNullable<ApiErrorBody["issues"]>;
  constructor(
    body: unknown,
    readonly status: number,
  ) {
    super(formatApiError(body));
    this.name = "ApiError";
    const code =
      body && typeof body === "object" && "code" in body
        ? (body as { code?: unknown }).code
        : undefined;
    this.code = typeof code === "string" ? code : undefined;
    this.issues =
      body && typeof body === "object" && "issues" in body
        ? ((body as { issues?: ApiError["issues"] }).issues ?? [])
        : [];
  }
}

/**
 * fetch يرمي TypeError ("Failed to fetch") حين لا يصل إلى الخادم المحلي؛
 * تُعرض بدلها رسالة عربية تقول ما العمل. الإلغاء (AbortError) يمرّ كما هو.
 */
async function send(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new Error(
      "تعذر الاتصال بخادم البرنامج. أعد المحاولة، وإن تكرر فأعد تشغيل البرنامج.",
    );
  }
}

/** طلب عام لا يتطلب توكن (الصحة، الإعداد، تسجيل الدخول). */
export async function publicRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await send(`${API_BASE}${path}`, buildRequest(init, false));
  const body = await parseBody(response);

  if (!response.ok) {
    throw new ApiError(body, response.status);
  }

  return body as T;
}

/** طلب يتطلب توكن المصادقة. يعالج 401 مركزياً. */
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await send(`${API_BASE}${path}`, buildRequest(init, true));
  const body = await parseBody(response);

  if (response.status === 401) {
    clearToken();
    onUnauthorized?.();
  }

  if (!response.ok) {
    throw new ApiError(body, response.status);
  }

  return body as T;
}

/** ملف بترويسة المصادقة (مستمسك مثلاً)، فلا يحتاج رابطاً يحمل رمزاً. */
export async function requestBlob(path: string): Promise<Blob> {
  const response = await send(`${API_BASE}${path}`, buildRequest({}, true));
  if (response.status === 401) {
    clearToken();
    onUnauthorized?.();
  }
  if (!response.ok)
    throw new ApiError(await parseBody(response), response.status);
  return response.blob();
}
