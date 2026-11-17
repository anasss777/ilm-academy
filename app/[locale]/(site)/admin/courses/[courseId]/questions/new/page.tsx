import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { parseUuid } from "@/lib/auth/params";
import { adminCourseContext } from "@/lib/ui/admin-context";
import { QuestionForm, type QuestionParent } from "@/components/admin/question-form";

export default async function NewQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; courseId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, courseId, perms, base } = await adminCourseContext(params, "/questions");
  const sp = await searchParams;
  const t = await getTranslations("admin.questions.form");

  let parent: QuestionParent;
  let backHref: string;

  const lectureId = sp.lectureId ? parseUuid(sp.lectureId) : null;
  const examId = sp.examId ? parseUuid(sp.examId) : null;

  if (lectureId) {
    if (!perms.has("question.create")) redirect({ href: "/admin/no-access", locale });
    const lecture = await db.lecture.findFirst({ where: { id: lectureId, courseId, deletedAt: null }, select: { id: true } });
    if (!lecture) notFound();
    parent = { kind: "lecture", lectureId };
    backHref = `${base}/questions`;
  } else if (examId) {
    if (!perms.has("exam.edit")) redirect({ href: "/admin/no-access", locale });
    const exam = await db.exam.findFirst({ where: { id: examId, courseId, deletedAt: null }, select: { id: true } });
    if (!exam) notFound();
    parent = { kind: "exam", examId };
    backHref = `${base}/exam`;
  } else {
    notFound();
  }

  return (
    <div className="stack gap-4">
      <h2 className="title-section">{t("newTitle")}</h2>
      <QuestionForm mode="create" courseId={courseId} parent={parent} backHref={backHref} />
    </div>
  );
}
