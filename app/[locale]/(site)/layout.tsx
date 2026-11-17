import { setRequestLocale } from "next-intl/server";
import { getPageUser } from "@/lib/auth/page";
import { db } from "@/lib/db";
import { getStaffScope } from "@/lib/auth/staff";
import { countUnread } from "@/lib/notifications/service";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await getPageUser();
  const isStaff = user ? (await getStaffScope(user.id)).isStaff : false;
  const unread = user ? await countUnread(db, user.id).catch(() => 0) : 0;

  return (
    <div className="page">
      <SiteHeader user={user ? { fullName: user.fullName, isStaff, unread } : null} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
