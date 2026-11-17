"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";

/**
 * Cover image: ask the server for a signed upload URL, send the file straight to Supabase
 * Storage, then save the returned path on the course. The server never handles the bytes.
 */
export function CoverUploader({ courseId, coverUrl }: { courseId: string; coverUrl: string | null }) {
  const t = useTranslations("admin.course");
  const router = useRouter();
  const { busy, error, run, fail } = useSave();
  const [uploading, setUploading] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;

    setUploading(true);
    const ticket = await apiRequest<{ bucket: string; path: string; token: string }>(
      "POST",
      `/api/admin/courses/${courseId}/cover/upload-url`,
      { contentType: file.type, size: file.size },
    );
    if (!ticket.ok) {
      fail({ code: ticket.code, message: ticket.message });
      setUploading(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage
      .from(ticket.data.bucket)
      .uploadToSignedUrl(ticket.data.path, ticket.data.token, file);
    if (uploadError) {
      fail({ code: "STORAGE_FAILED" });
      setUploading(false);
      return;
    }

    await run(
      () => apiRequest("PATCH", `/api/admin/courses/${courseId}`, { coverImagePath: ticket.data.path }),
      () => router.refresh(),
    );
    setUploading(false);
  }

  return (
    <section className="card stack gap-4">
      <h2 className="title-card">{t("coverTitle")}</h2>
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="aspect-video w-full max-w-md rounded-control border border-line object-cover" />
      ) : (
        <p className="text-sm text-muted">{t("coverNone")}</p>
      )}
      <div className="stack gap-2">
        <label className="label" htmlFor="cover-file">
          {uploading || busy ? t("coverUploading") : t("coverChoose")}
        </label>
        <input
          id="cover-file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="input"
          onChange={onPick}
          disabled={uploading || busy}
        />
        <p className="field-hint">{t("coverHint")}</p>
      </div>
      <ErrorNote error={error} />
    </section>
  );
}
