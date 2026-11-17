import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { parseUuid } from "@/lib/auth/params";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { LectureDeleteButton } from "@/components/admin/lecture-delete-button";
import { LectureForm } from "@/components/admin/lecture-form";
import { MaterialsManager } from "@/components/admin/materials-manager";
import { RecordingsManager } from "@/components/admin/recordings-manager";

export default async function AdminLecturePage({
  params,
}: {
  params: Promise<{ locale: string; courseId: string; lectureId: string }>;
}) {
  const ctx = await adminCourseContext(params, "/lectures", "lecture.edit");
  const { courseId, user, perms, base } = ctx;
  const lectureId = parseUuid(ctx.lectureId);
  if (!lectureId) notFound();
  const t = await getTranslations("admin.lectures");

  const lecture = await db.lecture.findFirst({
    where: { id: lectureId, courseId, deletedAt: null },
    select: {
      id: true, number: true, titleAr: true, titleEn: true, descriptionAr: true, descriptionEn: true,
      startsAt: true, endsAt: true, timezone: true, zoomUrl: true, zoomMeetingId: true, zoomPassword: true, status: true,
    },
  });
  if (!lecture) notFound();

  const [recordings, materials, settings] = await Promise.all([
    db.recording.findMany({
      where: { lectureId },
      orderBy: { position: "asc" },
      select: { id: true, provider: true, url: true, embedUrl: true, titleAr: true, titleEn: true, status: true, visibility: true },
    }),
    db.material.findMany({
      where: { lectureId, deletedAt: null },
      orderBy: { position: "asc" },
      select: { id: true, titleAr: true, titleEn: true, type: true, storagePath: true, externalUrl: true, status: true, visibility: true },
    }),
    db.courseSettings.findUnique({ where: { courseId }, select: { recordingsVisibility: true, materialsVisibility: true } }),
  ]);

  const s = (v: string | null) => v ?? "";

  return (
    <div className="stack gap-6">
      <Link href={`${base}/lectures`} className="link text-sm">
        {t("back")}
      </Link>
      <h2 className="title-section">{t("editTitle")}</h2>

      <LectureForm
        mode="edit"
        courseId={courseId}
        lectureId={lecture.id}
        defaultTimezone={user.timezone}
        initial={{
          number: lecture.number,
          titleAr: lecture.titleAr,
          titleEn: s(lecture.titleEn),
          descriptionAr: s(lecture.descriptionAr),
          descriptionEn: s(lecture.descriptionEn),
          startsAt: lecture.startsAt.toISOString(),
          endsAt: lecture.endsAt.toISOString(),
          timezone: lecture.timezone,
          zoomUrl: s(lecture.zoomUrl),
          zoomMeetingId: s(lecture.zoomMeetingId),
          zoomPassword: s(lecture.zoomPassword),
          status: lecture.status,
        }}
      />

      {perms.has("recording.manage") ? (
        <RecordingsManager
          lectureId={lecture.id}
          defaultVisibility={settings?.recordingsVisibility ?? "PUBLIC"}
          recordings={recordings}
        />
      ) : null}

      {perms.has("material.manage") ? (
        <MaterialsManager
          courseId={courseId}
          lectureId={lecture.id}
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

      {perms.has("lecture.delete") ? <LectureDeleteButton courseId={courseId} lectureId={lecture.id} /> : null}
    </div>
  );
}
