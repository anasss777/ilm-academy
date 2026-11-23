import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePageUser } from "@/lib/auth/page";
import { requirePagePermission } from "@/lib/auth/page-permissions";
import { CourseForm } from "@/components/admin/course-form";

export default async function NewCoursePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requirePageUser(locale, "/admin/courses/new");
  await requirePagePermission(locale, user.id, "course.create");
  const t = await getTranslations("admin.course");
  const tn = await getTranslations("admin.nav");

  return (
    <div className="container-page section stack gap-6">
      <Link href="/admin" className="link text-sm">
        {tn("dashboard")}
      </Link>
      <div className="stack gap-1">
        <h1 className="title-page">{t("newTitle")}</h1>
        <p className="lead">{t("newSubtitle")}</p>
      </div>
      <CourseForm mode="create" />
    </div>
  );
}
