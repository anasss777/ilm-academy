import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Bell } from "@/components/ui/icons";
import { Logo } from "./logo";
import { NavLink } from "./nav-link";

export async function SiteHeader({ user }: { user: { fullName: string; isStaff?: boolean; unread?: number } | null }) {
  const t = await getTranslations("nav");

  const links = (
    <>
      <NavLink href="/courses">{t("courses")}</NavLink>
      {user ? <NavLink href="/my-courses">{t("myCourses")}</NavLink> : null}
      {user?.isStaff ? <NavLink href="/admin">{t("admin")}</NavLink> : null}
    </>
  );

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" aria-label={t("home")}>
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 sm:flex" aria-label={t("menu")}>
          {links}
        </nav>

        <div className="cluster gap-2">
          <LocaleSwitcher />
          <ThemeToggle />
          {user ? (
            <>
              <Link
                href="/notifications"
                className="btn-ghost btn-icon relative"
                aria-label={user.unread ? t("notificationsUnread", { count: String(user.unread) }) : t("notifications")}
              >
                <Bell className="icon" />
                {user.unread ? <span className="notif-badge">{user.unread > 99 ? "99+" : user.unread}</span> : null}
              </Link>
              <span className="hidden max-w-40 truncate text-sm text-muted md:inline">{user.fullName}</span>
              <form action="/auth/signout" method="post">
                <button type="submit" className="btn-outline btn-sm">
                  {t("signOut")}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost btn-sm">
                {t("signIn")}
              </Link>
              <Link href="/register" className="btn-primary btn-sm">
                {t("register")}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Small screens: the links move to a second row */}
      <nav className="mx-auto flex w-full max-w-6xl gap-1 px-4 pb-2 sm:hidden" aria-label={t("menu")}>
        {links}
      </nav>
    </header>
  );
}
