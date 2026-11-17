import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { LectureForm } from "@/components/admin/lecture-form";

export default async function NewLecturePage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { courseId, user, base } = await adminCourseContext(params, "/lectures/new", "lecture.create");
  const t = await getTranslations("admin.lectures");

  return (
    <div className="stack gap-4">
      <Link href={`${base}/lectures`} className="link text-sm">
        {t("back")}
      </Link>
      <h2 className="title-section">{t("newTitle")}</h2>
      <LectureForm mode="create" courseId={courseId} defaultTimezone={user.timezone} />
    </div>
  );
}
