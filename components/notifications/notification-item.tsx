"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

/** One notification. Opening it marks it as read (the request keeps going while the page changes). */
export function NotificationItem({
  id,
  title,
  body,
  path,
  unread,
  whenText,
}: {
  id: string;
  title: string;
  body: string;
  path: string | null;
  unread: boolean;
  whenText: string;
}) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [isUnread, setIsUnread] = useState(unread);

  function markRead() {
    if (!isUnread) return;
    setIsUnread(false);
    void fetch("/api/me/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
      keepalive: true,
    })
      .catch(() => undefined)
      .finally(() => router.refresh()); // refreshes the unread count in the header
  }

  const content = (
    <>
      <span
        className={isUnread ? "mt-2 size-2.5 shrink-0 rounded-full bg-primary" : "mt-2 size-2.5 shrink-0 rounded-full bg-transparent"}
        aria-hidden
      />
      <span className="stack min-w-0 flex-1 gap-1">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className={isUnread ? "font-semibold text-ink" : "font-medium text-ink"} dir="auto">
            {title}
            {isUnread ? <span className="sr-only"> ({t("new")})</span> : null}
          </span>
          <span className="text-xs text-muted">{whenText}</span>
        </span>
        {body ? (
          <span className="text-sm text-muted" dir="auto">
            {body}
          </span>
        ) : null}
      </span>
    </>
  );

  if (path) {
    return (
      <li className={isUnread ? "card-plain card-link border-primary" : "card-plain card-link"}>
        <Link href={path} onClick={markRead} className="flex items-start gap-3 p-4">
          {content}
        </Link>
      </li>
    );
  }
  return (
    <li className={isUnread ? "card-plain border-primary" : "card-plain"}>
      <div className="flex items-start gap-3 p-4">
        {content}
        {isUnread ? (
          <button type="button" className="btn-ghost btn-sm shrink-0" onClick={markRead}>
            {t("markRead")}
          </button>
        ) : null}
      </div>
    </li>
  );
}
