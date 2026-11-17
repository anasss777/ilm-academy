// lib/client/api.ts
// Browser helper for calling our own API: returns a stable error code instead of throwing.

export type ApiResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; code: string; status: number; message?: string };

export async function apiRequest<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    // Our API always answers with { error: { code } }. A 404 without that shape means Next.js itself
    // found no route file for this URL (wrong folder, or the dev server needs a restart).
    const code = json?.error?.code ?? (res.status === 404 ? "ENDPOINT_NOT_FOUND" : "FAILED");
    return { ok: false, code, status: res.status, message: json?.error?.message };
  } catch {
    return { ok: false, code: "FAILED", status: 0 };
  }
}
