import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { coverImageUrl } from "@/lib/storage/rules";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { CourseContentForm } from "@/components/admin/course-content-form";
import { CourseForm, type CourseValues } from "@/components/admin/course-form";
import { CourseSettingsForm } from "@/components/admin/course-settings-form";
import { CourseStatusPanel } from "@/components/admin/course-status-panel";
import { CourseTeamSection } from "@/components/admin/course-team-section";
import { CoverUploader } from "@/components/admin/cover-uploader";
import { MaterialsManager } from "@/components/admin/materials-manager";

export default async function AdminCourseDetailsPage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string }>;
}) {
  const { locale, courseId, perms } = await adminCourseContext(params, "", "course.edit");
  setRequestLocale(locale);
  const ta = await getTranslations("admin.audit");

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      settings: true,
      objectives: { orderBy: { position: "asc" } },
      faqs: { orderBy: { position: "asc" } },
      instructors: { orderBy: { displayOrder: "asc" }, select: { user: { select: { fullName: true, email: true } } } },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!course) notFound();

  const materials = await db.material.findMany({
    where: { courseId, lectureId: null, deletedAt: null },
    orderBy: { position: "asc" },
    select: { id: true, titleAr: true, titleEn: true, type: true, storagePath: true, externalUrl: true, status: true, visibility: true },
  });

  const s = (v: string | null) => v ?? "";
  const values: CourseValues = {
    slug: course.slug,
    titleAr: course.titleAr,
    titleEn: s(course.titleEn),
    shortDescAr: s(course.shortDescAr),
    shortDescEn: s(course.shortDescEn),
    descriptionAr: s(course.descriptionAr),
    descriptionEn: s(course.descriptionEn),
    language: course.language,
    formatAr: s(course.formatAr),
    formatEn: s(course.formatEn),
    lectureFrequencyAr: s(course.lectureFrequencyAr),
    lectureFrequencyEn: s(course.lectureFrequencyEn),
    targetAudienceAr: s(course.targetAudienceAr),
    targetAudienceEn: s(course.targetAudienceEn),
    prerequisitesAr: s(course.prerequisitesAr),
    prerequisitesEn: s(course.prerequisitesEn),
    enrollmentOpen: course.enrollmentOpen,
    attendanceEnabled: course.attendanceEnabled,
    questionsEnabled: course.questionsEnabled,
    examEnabled: course.examEnabled,
    certificateEnabled: course.certificateEnabled,
    recordingsEnabled: course.recordingsEnabled,
  };
  const settings = course.settings;

  return (
    <div className="stack gap-6">
      {perms.has("audit.view") ? (
        <div>
          <Link href={`/admin/audit?entityType=Course&entityId=${courseId}`} className="link text-sm">
            {ta("history")}
          </Link>
        </div>
      ) : null}

      <CourseStatusPanel
        courseId={courseId}
        slug={course.slug}
        status={course.status}
        activeEnrollments={course._count.enrollments}
        canPublish={perms.has("course.publish")}
        canArchive={perms.has("course.archive")}
      />

      <CourseForm mode="edit" courseId={courseId} initial={values} slugLocked={course.status !== "DRAFT"} />

      <CoverUploader courseId={courseId} coverUrl={coverImageUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", course.coverImagePath)} />

      <CourseSettingsForm
        courseId={courseId}
        initial={{
          partialWeight: String(Number(settings?.partialWeight ?? 1)),
          allowLateSubmissions: settings?.allowLateSubmissions ?? true,
          defaultPenaltyType: settings?.defaultPenaltyType ?? "NONE",
          defaultPenaltyValue: String(Number(settings?.defaultPenaltyValue ?? 0)),
          answerRevealMode: settings?.answerRevealMode ?? "AFTER_GRADE_AND_DEADLINE",
          recordingsVisibility: settings?.recordingsVisibility ?? "PUBLIC",
          materialsVisibility: settings?.materialsVisibility ?? "PUBLIC",
        }}
      />

      <CourseContentForm
        courseId={courseId}
        initialObjectives={course.objectives.map((o) => ({ textAr: o.textAr, textEn: s(o.textEn) }))}
        initialFaqs={course.faqs.map((f) => ({ questionAr: f.questionAr, questionEn: s(f.questionEn), answerAr: f.answerAr, answerEn: s(f.answerEn) }))}
      />

      <CourseTeamSection
        courseId={courseId}
        perms={perms}
        publicInstructors={course.instructors.map((i) => ({ fullName: i.user.fullName, email: i.user.email }))}
      />

      {perms.has("material.manage") ? (
        <MaterialsManager
          courseId={courseId}
          lectureId={null}
          defaultVisibility={settings?.materialsVisibility ?? "PUBLIC"}
          materials={materials.map((m) => ({
            id: m.id,
            titleAr: m.titleAr,
            titleEn: m.titleEn,
            type: m.type,
            isFile: m.storagePath != null,
            externalUrl: m.externalUrl,
            status: m.status,
            visibility: m.visibility,
          }))}
        />
      ) : null}
    </div>
  );
}
