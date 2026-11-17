"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SelectField, TextField } from "./fields";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";

type Visibility = "PUBLIC" | "SIGNED_IN" | "ENROLLED";
type PublishStatus = "DRAFT" | "PUBLISHED";
type MaterialType = "PDF" | "DOC" | "OTHER";

export type MaterialItem = {
  id: string;
  titleAr: string;
  titleEn: string | null;
  type: MaterialType;
  isFile: boolean;
  externalUrl: string | null;
  status: PublishStatus;
  visibility: Visibility;
};

const VISIBILITIES: Visibility[] = ["PUBLIC", "SIGNED_IN", "ENROLLED"];

function MaterialRow({ item }: { item: MaterialItem }) {
  const t = useTranslations("admin.materials");
  const tv = useTranslations("admin.visibility");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const { busy, error, run } = useSave();
  const [confirming, setConfirming] = useState(false);

  const patch = (body: Record<string, string>) =>
    run(
      () => apiRequest("PATCH", `/api/admin/materials/${item.id}`, body),
      () => router.refresh(),
    );

  return (
    <li className="stack gap-3 rounded-control border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* The download route applies the same visibility rules students get */}
        <a href={`/api/materials/${item.id}/download`} target="_blank" rel="noopener noreferrer" className="link" dir="auto">
          {item.titleAr || item.titleEn}
        </a>
        <span className="badge-primary">{t(`types.${item.type}`)}</span>
      </div>
      <div className="form-grid">
        <SelectField id={`m-status-${item.id}`} label={t("status")} value={item.status} disabled={busy} onChange={(e) => patch({ status: e.target.value })}>
          <option value="DRAFT">{t("draft")}</option>
          <option value="PUBLISHED">{t("published")}</option>
        </SelectField>
        <SelectField id={`m-vis-${item.id}`} label={t("visibility")} value={item.visibility} disabled={busy} onChange={(e) => patch({ visibility: e.target.value })}>
          {VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {tv(v)}
            </option>
          ))}
        </SelectField>
      </div>
      <ErrorNote error={error} />
      {confirming ? (
        <div className="cluster">
          <span className="text-sm">{t("deleteConfirm")}</span>
          <button
            type="button"
            className="btn-danger btn-sm"
            disabled={busy}
            onClick={() => run(() => apiRequest("DELETE", `/api/admin/materials/${item.id}`), () => router.refresh())}
          >
            {tc("confirmDelete")}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>
            {tc("cancel")}
          </button>
        </div>
      ) : (
        <div>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(true)}>
            {tc("delete")}
          </button>
        </div>
      )}
    </li>
  );
}

/** Course-level materials (lectureId null) or one lecture's materials. */
export function MaterialsManager({
  courseId,
  lectureId,
  materials,
  defaultVisibility,
}: {
  courseId: string;
  lectureId: string | null;
  materials: MaterialItem[];
  defaultVisibility: Visibility;
}) {
  const t = useTranslations("admin.materials");
  const tv = useTranslations("admin.visibility");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const { busy, error, run, fail } = useSave();
  const [uploading, setUploading] = useState(false);

  const [source, setSource] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [type, setType] = useState<MaterialType>("PDF");
  const [status, setStatus] = useState<PublishStatus>("PUBLISHED");
  const [visibility, setVisibility] = useState<Visibility>(defaultVisibility);

  const ready = titleAr.trim() && (source === "file" ? file : url.trim());

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const common = { lectureId, titleAr: titleAr.trim(), titleEn, status, visibility };
    const reset = () => {
      setFile(null);
      setUrl("");
      setTitleAr("");
      setTitleEn("");
      router.refresh();
    };

    if (source === "link") {
      await run(() => apiRequest("POST", `/api/admin/courses/${courseId}/materials`, { ...common, type, externalUrl: url.trim() }), reset);
      return;
    }
    if (!file) return;

    // File: signed upload straight to storage, then attach the stored path
    setUploading(true);
    const ticket = await apiRequest<{ bucket: string; path: string; token: string; materialType: MaterialType | null }>(
      "POST",
      `/api/admin/courses/${courseId}/materials/upload-url`,
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
      () =>
        apiRequest("POST", `/api/admin/courses/${courseId}/materials`, {
          ...common,
          type: ticket.data.materialType ?? "OTHER",
          storagePath: ticket.data.path,
        }),
      reset,
    );
    setUploading(false);
  }

  return (
    <section className="card stack gap-4">
      <h2 className="title-card">{t("title")}</h2>
      {materials.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="stack gap-3">
          {materials.map((m) => (
            <MaterialRow key={m.id} item={m} />
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="stack gap-3 border-t border-line pt-4" noValidate>
        <h3 className="font-semibold text-ink">{t("add")}</h3>
        <div className="form-grid">
          <SelectField id={`mat-source-${lectureId ?? "course"}`} label={t("source")} value={source} onChange={(e) => setSource(e.target.value as "file" | "link")}>
            <option value="file">{t("file")}</option>
            <option value="link">{t("link")}</option>
          </SelectField>
          {source === "file" ? (
            <div>
              <label className="label" htmlFor={`mat-file-${lectureId ?? "course"}`}>
                {uploading ? t("uploading") : t("pickFile")}
              </label>
              <input
                id={`mat-file-${lectureId ?? "course"}`}
                type="file"
                className="input"
                accept=".pdf,.doc,.docx,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="field-hint">{t("fileHint")}</p>
            </div>
          ) : (
            <TextField id={`mat-url-${lectureId ?? "course"}`} label={t("url")} type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} />
          )}
          <TextField id={`mat-title-ar-${lectureId ?? "course"}`} label={t("titleAr")} dir="auto" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} required />
          <TextField id={`mat-title-en-${lectureId ?? "course"}`} label={t("titleEn")} dir="auto" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          {source === "link" ? (
            <SelectField id={`mat-type-${lectureId ?? "course"}`} label={t("type")} value={type} onChange={(e) => setType(e.target.value as MaterialType)}>
              {(["PDF", "DOC", "OTHER"] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`types.${k}`)}
                </option>
              ))}
            </SelectField>
          ) : null}
          <SelectField id={`mat-status-${lectureId ?? "course"}`} label={t("status")} value={status} onChange={(e) => setStatus(e.target.value as PublishStatus)}>
            <option value="DRAFT">{t("draft")}</option>
            <option value="PUBLISHED">{t("published")}</option>
          </SelectField>
          <SelectField id={`mat-vis-${lectureId ?? "course"}`} label={t("visibility")} value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {tv(v)}
              </option>
            ))}
          </SelectField>
        </div>
        <ErrorNote error={error} />
        <div>
          <button type="submit" className="btn-primary" disabled={busy || uploading || !ready}>
            {busy || uploading ? tc("adding") : tc("add")}
          </button>
        </div>
      </form>
    </section>
  );
}
