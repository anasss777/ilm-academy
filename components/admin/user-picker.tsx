"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiRequest } from "@/lib/client/api";

export type PickedUser = { id: string; fullName: string; email: string };

/** Search existing accounts by name or email and pick one. */
export function UserPicker({ value, onChange }: { value: PickedUser | null; onChange: (u: PickedUser | null) => void }) {
  const t = useTranslations("admin.team");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (value || term.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      setLoading(true);
      const res = await apiRequest<{ items: PickedUser[] }>("GET", `/api/admin/users?q=${encodeURIComponent(term)}`);
      if (cancelled) return;
      setLoading(false);
      setResults(res.ok ? res.data.items : []);
      setSearched(true);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [q, value]);

  if (value) {
    return (
      <div className="stack gap-1">
        <span className="label">{t("selected")}</span>
        <div className="panel flex flex-wrap items-center justify-between gap-3">
          <div className="stack gap-0.5">
            <span className="font-medium text-ink" dir="auto">{value.fullName}</span>
            <span className="text-xs text-muted" dir="ltr">{value.email}</span>
          </div>
          <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(null)}>
            {t("change")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack gap-2">
      <div>
        <label htmlFor="user-picker" className="label">{t("searchLabel")}</label>
        <input
          id="user-picker"
          type="search"
          className="input"
          dir="auto"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <p className="field-hint">{t("searchHint")}</p>
      </div>
      {loading ? <p className="text-sm text-muted">{t("searching")}</p> : null}
      {results.length > 0 ? (
        <ul className="stack gap-1" role="listbox">
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                className="panel flex w-full flex-wrap items-center justify-between gap-2 text-start hover:border-primary"
                onClick={() => {
                  onChange(u);
                  setQ("");
                }}
              >
                <span className="font-medium text-ink" dir="auto">{u.fullName}</span>
                <span className="text-xs text-muted" dir="ltr">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : searched && !loading ? (
        <p className="text-sm text-muted">{t("noMatches")}</p>
      ) : null}
    </div>
  );
}
