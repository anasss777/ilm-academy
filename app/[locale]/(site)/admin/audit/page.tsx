import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/page";
import { requirePagePermission } from "@/lib/auth/page-permissions";
import { formatDateTime } from "@/lib/format";
import { AUDIT_AREAS, KNOWN_AUDIT_ACTIONS, actionMessageKey, parseAuditFilter } from "@/lib/staff/audit-filter";
import { listAuditEntityTypes, listAuditLog } from "@/lib/staff/audit-log";
import { Pagination } from "@/components/site/pagination";

const PAGE_SIZE = 50;
const known = new Set<string>(KNOWN_AUDIT_ACTIONS);

const pretty = (value: unknown) => {
  const text = JSON.stringify(value ?? {}, null, 2) ?? "{}";
  return text.length > 3000 ? `${text.slice(0, 3000)}\n…` : text;
};

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser(locale, "/admin/audit");
  await requirePagePermission(locale, user.id, "audit.view");

  const sp = await searchParams;
  const t = await getTranslations("admin.audit");
  const tn = await getTranslations("admin.nav");
  const { filter, query } = parseAuditFilter(sp, user.timezone);
  const page = Math.min(10_000, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));

  const [{ total, items }, entityTypes] = await Promise.all([
    listAuditLog(db, { filter, page, pageSize: PAGE_SIZE }),
    listAuditEntityTypes(db),
  ]);

  const withParam = (extra: Record<string, string>) => `/admin/audit?${new URLSearchParams({ ...query, ...extra }).toString()}`;
  const without = (key: string) => {
    const rest = { ...query };
    delete rest[key];
    const qs = new URLSearchParams(rest).toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  };

  return (
    <div className="container-page section stack gap-6">
      <Link href="/admin" className="link text-sm">
        {tn("dashboard")}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="stack gap-1">
          <h1 className="title-page">{t("title")}</h1>
          <p className="lead">{t("subtitle")}</p>
        </div>
        <div className="stack items-end gap-1">
          <a href={`/api/admin/audit/export?${new URLSearchParams(query).toString()}`} className="btn-outline">
            {t("export")}
          </a>
          <span className="max-w-xs text-xs text-muted">{t("exportNote")}</span>
        </div>
      </div>

      <form method="get" className="card stack gap-4">
        {/* Keep the person / item filters when the other filters are applied */}
        {query.actor ? <input type="hidden" name="actor" value={query.actor} /> : null}
        {query.entityId ? <input type="hidden" name="entityId" value={query.entityId} /> : null}
        <div className="form-grid">
          <div>
            <label htmlFor="q" className="label">{t("search")}</label>
            <input id="q" name="q" type="search" defaultValue={query.q} className="input" dir="auto" />
            <p className="field-hint">{t("searchHint")}</p>
          </div>
          <div className="form-grid">
            <div>
              <label htmlFor="area" className="label">{t("area")}</label>
              <select id="area" name="area" defaultValue={query.area ?? ""} className="select">
                <option value="">{t("allAreas")}</option>
                {AUDIT_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {t(`areas.${a}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="entityType" className="label">{t("entityType")}</label>
              <select id="entityType" name="entityType" defaultValue={query.entityType ?? ""} className="select">
                <option value="">{t("allEntities")}</option>
                {entityTypes.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="from" className="label">{t("from")}</label>
            <input id="from" name="from" type="date" defaultValue={query.from} className="input" dir="ltr" />
          </div>
          <div>
            <label htmlFor="to" className="label">{t("to")}</label>
            <input id="to" name="to" type="date" defaultValue={query.to} className="input" dir="ltr" />
          </div>
        </div>
        <p className="text-xs text-muted">{t("tzNote", { tz: user.timezone })}</p>
        <div className="cluster gap-2">
          <button type="submit" className="btn-primary">{t("apply")}</button>
          <Link href="/admin/audit" className="btn-ghost">{t("clear")}</Link>
        </div>
      </form>

      {query.actor || query.entityId ? (
        <div className="cluster gap-2 text-sm">
          {query.actor ? (
            <span className="badge-info">
              {t("onlyActor")} · <Link href={without("actor")} className="link">{t("removeFilter")}</Link>
            </span>
          ) : null}
          {query.entityId ? (
            <span className="badge-info">
              {t("onlyEntity")} · <Link href={without("entityId")} className="link">{t("removeFilter")}</Link>
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="text-sm text-muted">{t("total", { count: String(total) })}</p>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>{t("empty")}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("when")}</th>
                <th>{t("who")}</th>
                <th>{t("action")}</th>
                <th>{t("entity")}</th>
                <th>{t("details")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-sm">{formatDateTime(e.createdAt, locale, user.timezone)}</td>
                  <td>
                    {e.actor ? (
                      <Link href={withParam({ actor: e.actor.id })} className="stack gap-0.5">
                        <span className="font-medium text-ink" dir="auto">{e.actor.fullName}</span>
                        <span className="text-xs text-muted" dir="ltr">{e.actor.email}</span>
                      </Link>
                    ) : (
                      <span className="text-sm text-muted">{t("system")}</span>
                    )}
                  </td>
                  <td>
                    <div className="stack gap-0.5">
                      <span className="text-sm font-medium text-ink">{known.has(e.action) ? t(`actions.${actionMessageKey(e.action)}`) : e.action}</span>
                      <span className="text-xs text-muted" dir="ltr">{e.action}</span>
                    </div>
                  </td>
                  <td>
                    <div className="stack gap-0.5 text-sm">
                      <span>{e.entityType}</span>
                      <Link href={withParam({ entityType: e.entityType, entityId: e.entityId })} className="link text-xs" dir="ltr">
                        {e.entityId.slice(0, 8)}
                      </Link>
                      {e.entityType === "Course" ? (
                        <Link href={`/admin/courses/${e.entityId}`} className="link text-xs">
                          {tn("details")}
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <details>
                      <summary className="cursor-pointer text-sm text-primary">{t("showDetails")}</summary>
                      <pre className="mt-2 max-w-md overflow-x-auto rounded-control bg-surface-alt p-3 text-xs" dir="ltr">{pretty(e.metadata)}{e.ip ? `\nip: ${e.ip}` : ""}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination pathname="/admin/audit" page={page} pageSize={PAGE_SIZE} total={total} query={query} />
    </div>
  );
}
