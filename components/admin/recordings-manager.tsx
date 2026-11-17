"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { SelectField, TextField } from "./fields";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";

type Provider = "YOUTUBE" | "GOOGLE_DRIVE" | "ONEDRIVE" | "OTHER";
type Visibility = "PUBLIC" | "SIGNED_IN" | "ENROLLED";
type PublishStatus = "DRAFT" | "PUBLISHED";

export type RecordingItem = {
  id: string;
  provider: Provider;
  url: string;
  embedUrl: string | null;
  titleAr: string | null;
  titleEn: string | null;
  status: PublishStatus;
  visibility: Visibility;
};

const PROVIDERS: Provider[] = ["YOUTUBE", "GOOGLE_DRIVE", "ONEDRIVE", "OTHER"];
const VISIBILITIES: Visibility[] = ["PUBLIC", "SIGNED_IN", "ENROLLED"];

function RecordingRow({ item }: { item: RecordingItem }) {
  const t = useTranslations("admin.recordings");
  const tv = useTranslations("admin.visibility");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const { busy, error, run } = useSave();
  const [confirming, setConfirming] = useState(false);

  const patch = (body: Record<string, string>) =>
    run(
      () => apiRequest("PATCH", `/api/admin/recordings/${item.id}`, body),
      () => router.refresh(),
    );

  return (
    <li className="stack gap-3 rounded-control border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ink" dir="auto">
          {item.titleAr || item.titleEn || item.url}
        </span>
        <div className="cluster gap-2">
          <span className="badge-primary">{t(`providers.${item.provider}`)}</span>
          <span className={item.embedUrl ? "badge-success" : "badge-muted"}>{item.embedUrl ? t("embedded") : t("linkOnly")}</span>
        </div>
      </div>
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="link break-all text-xs" dir="ltr">
        {item.url}
      </a>
      <div className="form-grid">
        <SelectField id={`r-status-${item.id}`} label={t("status")} value={item.status} disabled={busy} onChange={(e) => patch({ status: e.target.value })}>
          <option value="DRAFT">{t("draft")}</option>
          <option value="PUBLISHED">{t("published")}</option>
        </SelectField>
        <SelectField id={`r-vis-${item.id}`} label={t("visibility")} value={item.visibility} disabled={busy} onChange={(e) => patch({ visibility: e.target.value })}>
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
            onClick={() => run(() => apiRequest("DELETE", `/api/admin/recordings/${item.id}`), () => router.refresh())}
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

export function RecordingsManager({
  lectureId,
  recordings,
  defaultVisibility,
}: {
  lectureId: string;
  recordings: RecordingItem[];
  defaultVisibility: Visibility;
}) {
  const t = useTranslations("admin.recordings");
  const tv = useTranslations("admin.visibility");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const { busy, error, run } = useSave();

  const [provider, setProvider] = useState<Provider>("YOUTUBE");
  const [url, setUrl] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [status, setStatus] = useState<PublishStatus>("PUBLISHED");
  const [visibility, setVisibility] = useState<Visibility>(defaultVisibility);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await run(
      () =>
        apiRequest("POST", `/api/admin/lectures/${lectureId}/recordings`, {
          provider,
          url: url.trim(),
          titleAr,
          titleEn,
          status,
          visibility,
        }),
      () => {
        setUrl("");
        setTitleAr("");
        setTitleEn("");
        router.refresh();
      },
    );
  }

  return (
    <section className="card stack gap-4">
      <h2 className="title-card">{t("title")}</h2>
      {recordings.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="stack gap-3">
          {recordings.map((r) => (
            <RecordingRow key={r.id} item={r} />
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="stack gap-3 border-t border-line pt-4" noValidate>
        <h3 className="font-semibold text-ink">{t("add")}</h3>
        <div className="form-grid">
          <SelectField id="rec-provider" label={t("provider")} value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {t(`providers.${p}`)}
              </option>
            ))}
          </SelectField>
          <TextField id="rec-url" label={t("url")} hint={t("urlHint")} type="url" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <TextField id="rec-title-ar" label={t("titleAr")} dir="auto" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
          <TextField id="rec-title-en" label={t("titleEn")} dir="auto" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          <SelectField id="rec-status" label={t("status")} value={status} onChange={(e) => setStatus(e.target.value as PublishStatus)}>
            <option value="DRAFT">{t("draft")}</option>
            <option value="PUBLISHED">{t("published")}</option>
          </SelectField>
          <SelectField id="rec-vis" label={t("visibility")} value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {tv(v)}
              </option>
            ))}
          </SelectField>
        </div>
        <ErrorNote error={error} />
        <div>
          <button type="submit" className="btn-primary" disabled={busy || !url.trim()}>
            {busy ? tc("adding") : tc("add")}
          </button>
        </div>
      </form>
    </section>
  );
}
