// lib/client/enroll.ts
// Browser helper: call the enroll endpoint and report a stable error code instead of throwing.

export async function enrollRequest(
  courseId: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  try {
    const res = await fetch(`/api/courses/${courseId}/enroll`, { method: "POST" });
    if (res.ok) return { ok: true };
    const body = await res.json().catch(() => null);
    return { ok: false, code: body?.error?.code ?? "FAILED" };
  } catch {
    return { ok: false, code: "FAILED" };
  }
}
