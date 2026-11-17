import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/auth/page";
import { formatDateTime } from "@/lib/format";
import { loadContexts } from "@/lib/notifications/context";
import { isEmailConfigured } from "@/lib/notifications/email";
import { listNotifications } from "@/lib/notifications/service";
import { buildView } from "@/lib/notifications/view";
import { Pagination } from "@/components/site/pagination";
import { EmailPreference } from "@/components/notifications/email-preference";
import { MarkAllButton } from "@/components/notifications/mark-all-button";
import { NotificationItem } from "@/components/notifications/notification-item";

const PAGE_SIZE = 20;

export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const user = await requirePageUser(locale, "/notifications");
  const t = await getTranslations("notifications");

  const page = Math.min(10_000, Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1));
  const [{ items, total, unread }, prefs] = await Promise.all([
    listNotifications(db, { userId: user.id, page, pageSize: PAGE_SIZE }),
    db.user.findUnique({ where: { id: user.id }, select: { emailNotifications: true } }),
  ]);
  const contexts = await loadContexts(db, items);

  return (
    <div className="container-page section stack gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="stack gap-1">
          <h1 className="title-page">{t("title")}</h1>
          <p className="lead">{unread > 0 ? t("unread", { count: String(unread) }) : t("allRead")}</p>
        </div>
        {unread > 0 ? <MarkAllButton /> : null}
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>{t("empty")}</p>
        </div>
      ) : (
        <ul className="stack gap-3">
          {items.map((n) => {
            const view = buildView({
              type: n.type,
              payload: n.payload,
              ctx: contexts.get(n.id) ?? {},
              locale,
              timezone: user.timezone,
            });
            return (
              <NotificationItem
                key={n.id}
                id={n.id}
                title={view.title}
                body={view.body}
                path={view.path}
                unread={n.readAt == null}
                whenText={formatDateTime(n.createdAt, locale, user.timezone)}
              />
            );
          })}
        </ul>
      )}

      <Pagination pathname="/notifications" page={page} pageSize={PAGE_SIZE} total={total} query={{}} />

      {isEmailConfigured() ? <EmailPreference initial={prefs?.emailNotifications ?? true} /> : null}
    </div>
  );
}
