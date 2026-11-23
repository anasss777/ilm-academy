// scripts/seed-demo.ts
// Creates ONE published demo course, with lectures, questions, an exam and (optionally) a
// student, so every public and student page has something to show while the staff screens do not
// exist yet.
//
//   $env:DEMO_INSTRUCTOR_EMAIL="you@example.com"; npx tsx scripts/seed-demo.ts
//   optional: $env:DEMO_STUDENT_EMAIL="student@example.com"   (defaults to the instructor's account)
//   remove everything it created:           ... npx tsx scripts/seed-demo.ts --remove
//
// Both emails must belong to accounts you already registered. Run --remove first if an older
// version of the demo course exists.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
// ADJUST this import if your generator output differs
import { PrismaClient } from "@/generated/prisma/client";
import { publishCertificateRequirement } from "@/lib/eligibility/loader";
import { saveAttendance } from "@/lib/staff/attendance";
import {
  createCourse,
  replaceCourseContent,
  transitionCourse,
} from "@/lib/staff/courses";
import { createExam, updateExam } from "@/lib/staff/exams";
import { createLecture } from "@/lib/staff/lectures";
import { createQuestion } from "@/lib/staff/questions";
import { staffEnrollStudent } from "@/lib/staff/students";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
});

const SLUG = "demo-course";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function findUser(email: string) {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, deletedAt: null },
  });
  if (!user)
    throw new Error(
      `No account with email ${email}. Register it on the site first.`,
    );
  return user;
}

async function removeDemo(courseId: string) {
  const inCourse = { courseId };
  await prisma.examAnswer.deleteMany({
    where: { attempt: { exam: inCourse } },
  });
  await prisma.examAttempt.deleteMany({ where: { exam: inCourse } });
  await prisma.examAttemptGrant.deleteMany({ where: { exam: inCourse } });
  await prisma.deadlineExtension.deleteMany({ where: { question: inCourse } });
  await prisma.questionSubmission.deleteMany({ where: { question: inCourse } });
  await prisma.question.deleteMany({ where: inCourse });
  await prisma.exam.deleteMany({ where: inCourse });
  await prisma.attendanceRecord.deleteMany({ where: inCourse });
  await prisma.certificateReview.deleteMany({ where: inCourse });
  await prisma.certificateRequirement.deleteMany({ where: inCourse });
  await prisma.material.deleteMany({ where: inCourse });
  await prisma.lecture.deleteMany({ where: inCourse });
  await prisma.enrollment.deleteMany({ where: inCourse });
  await prisma.course.delete({ where: { id: courseId } });
}

async function main() {
  const instructorEmail = "anass2000271@gmail.com";
  if (!instructorEmail)
    throw new Error(
      "Set DEMO_INSTRUCTOR_EMAIL to the email of a registered account",
    );
  const instructor = await findUser(instructorEmail);
  const existing = await prisma.course.findFirst({
    where: { slug: SLUG },
    select: { id: true },
  });

  if (process.argv.includes("--remove")) {
    if (!existing) return console.log("No demo course to remove.");
    await removeDemo(existing.id);
    return console.log("Demo course and everything attached to it removed.");
  }
  if (existing)
    return console.log(
      `The demo course already exists: /ar/courses/${SLUG} (use --remove to delete it first)`,
    );

  const actorId = instructor.id;
  const course = await createCourse(prisma, {
    actorId,
    input: {
      slug: SLUG,
      titleAr: "دورة تجريبية: مدخل إلى التعلّم المنظّم",
      titleEn: "Demo course: An introduction to structured learning",
      shortDescAr:
        "دورة تجريبية تُظهر شكل صفحة الدورة: الجدول والأهداف والشهادة والأسئلة الشائعة.",
      shortDescEn:
        "A demo course that shows what a course page looks like: schedule, objectives, certificate and FAQ.",
      descriptionAr:
        "هذه دورة تجريبية أُنشئت لمعاينة الصفحات.\nتتضمن محاضرات مباشرة عبر Zoom، وتسجيلات لكل محاضرة، وأسئلة بعد كل محاضرة، وامتحانًا نهائيًا، وشهادة للمستحقين.\nيمكنك حذفها في أي وقت.",
      descriptionEn:
        "This is a demo course created to preview the pages.\nIt includes live Zoom lectures, a recording for each lecture, questions after each lecture, a final exam, and a certificate for those who qualify.\nYou can remove it at any time.",
      language: "ar",
      formatAr: "محاضرات مباشرة عبر Zoom",
      formatEn: "Live lectures on Zoom",
      lectureFrequencyAr: "محاضرة أسبوعية",
      lectureFrequencyEn: "One lecture per week",
      targetAudienceAr: "كل من يرغب في تجربة المنصّة.",
      targetAudienceEn: "Anyone who wants to try the platform.",
      prerequisitesAr: "لا توجد متطلبات مسبقة.",
      prerequisitesEn: "No prerequisites.",
      certificateEnabled: true,
      attendanceEnabled: true,
      questionsEnabled: true,
      examEnabled: true,
    },
  });

  await replaceCourseContent(prisma, {
    courseId: course.id,
    actorId,
    input: {
      objectives: [
        {
          textAr: "فهم كيفية سير الدورة من التسجيل حتى الشهادة",
          textEn:
            "Understand how a course runs, from enrollment to certificate",
        },
        {
          textAr: "متابعة الحضور والدرجات في لوحة واحدة",
          textEn: "Follow your attendance and grades in one place",
        },
        {
          textAr: "الإجابة عن أسئلة المحاضرات والاطّلاع على التغذية الراجعة",
          textEn: "Answer lecture questions and read the feedback",
        },
        {
          textAr: "الرجوع إلى تسجيلات المحاضرات في أي وقت",
          textEn: "Return to lecture recordings at any time",
        },
      ],
      faqs: [
        {
          questionAr: "هل الدورة مجانية؟",
          questionEn: "Is the course free?",
          answerAr: "نعم، التسجيل مجاني.",
          answerEn: "Yes, enrollment is free.",
        },
        {
          questionAr: "كيف أحصل على الشهادة؟",
          questionEn: "How do I get the certificate?",
          answerAr:
            "تُصدر الشهادة من جهة خارجية لمن يحقق شروط الحضور والأسئلة المذكورة في صفحة الدورة.",
          answerEn:
            "An external organization issues it to students who meet the attendance and question requirements shown on the course page.",
        },
      ],
    },
  });

  await publishCertificateRequirement(prisma, {
    courseId: course.id,
    actorId,
    thresholds: {
      minAttendancePercent: 80,
      minQuestionScorePercent: 60,
      minExamPercent: 50,
    },
  });

  // Two lectures already held, three upcoming
  const lectureIds: string[] = [];
  for (const [i, days] of [-14, -7, 1, 8, 15].entries()) {
    const startsAt = new Date(Date.now() + days * DAY);
    startsAt.setUTCHours(18, 0, 0, 0);
    const lecture = await createLecture(prisma, {
      courseId: course.id,
      actorId,
      input: {
        number: i + 1,
        titleAr: `المحاضرة ${i + 1}: موضوع تجريبي`,
        titleEn: `Lecture ${i + 1}: A demo topic`,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * HOUR),
        timezone: "Africa/Tunis",
        zoomUrl: "https://zoom.us/j/0000000000",
        zoomMeetingId: "000 000 0000",
        status: "PUBLISHED",
      },
    });
    lectureIds.push(lecture.id);
  }

  // Lecture questions: one on time, one written, one already late
  await createQuestion(prisma, {
    parent: { kind: "lecture", lectureId: lectureIds[0] },
    actorId,
    input: {
      type: "MULTIPLE_CHOICE",
      body: "ما العادة الأنفع عند مراجعة المحاضرة؟",
      points: 10,
      status: "PUBLISHED",
      dueAt: new Date(Date.now() + 7 * DAY),
      explanation: "التلخيص بأسلوبك يثبّت الفهم أكثر من إعادة القراءة فقط.",
      options: [
        { text: "قراءة الملاحظات ثم تلخيصها بأسلوبك", isCorrect: true },
        { text: "تأجيل المراجعة إلى ليلة الامتحان", isCorrect: false },
        { text: "الاكتفاء بمشاهدة التسجيل مرة واحدة", isCorrect: false },
      ],
    },
  });
  await createQuestion(prisma, {
    parent: { kind: "lecture", lectureId: lectureIds[0] },
    actorId,
    input: {
      type: "OPEN",
      body: "اكتب فقرة قصيرة تلخّص أهم ما تعلمته من هذه المحاضرة.",
      points: 10,
      status: "PUBLISHED",
      dueAt: new Date(Date.now() + 7 * DAY),
    },
  });
  await createQuestion(prisma, {
    parent: { kind: "lecture", lectureId: lectureIds[1] },
    actorId,
    input: {
      type: "TRUE_FALSE",
      body: "الحضور المباشر يُحتسب ضمن شروط الشهادة.",
      correctAnswer: true,
      points: 5,
      status: "PUBLISHED",
      dueAt: new Date(Date.now() - DAY), // already past: answering is allowed but marked late
      explanation: "نعم، تُحتسب نسبة الحضور من المحاضرات المنعقدة.",
    },
  });

  // Final exam: one objective and one written question
  const exam = await createExam(prisma, {
    courseId: course.id,
    actorId,
    input: {
      titleAr: "الامتحان النهائي التجريبي",
      titleEn: "Demo final exam",
      descriptionAr: "امتحان قصير لمعاينة تجربة الامتحان.",
      descriptionEn: "A short exam to preview the exam experience.",
      passingPercent: 50,
    },
  });
  await createQuestion(prisma, {
    parent: { kind: "exam", examId: exam.id },
    actorId,
    input: {
      type: "MULTIPLE_CHOICE",
      body: "أي مما يلي يُظهر تقدّمك في الدورة؟",
      points: 5,
      status: "PUBLISHED",
      options: [
        { text: "صفحة «تقدّمي»", isCorrect: true },
        { text: "صفحة الدورة العامة", isCorrect: false },
      ],
    },
  });
  await createQuestion(prisma, {
    parent: { kind: "exam", examId: exam.id },
    actorId,
    input: {
      type: "OPEN",
      body: "اشرح بكلماتك كيف تستفيد من تسجيلات المحاضرات.",
      points: 10,
      status: "PUBLISHED",
    },
  });
  await updateExam(prisma, {
    examId: exam.id,
    actorId,
    input: { status: "PUBLISHED" },
  });

  await transitionCourse(prisma, {
    courseId: course.id,
    action: "publish",
    actorId,
  });

  // A student with some attendance recorded
  const student = await findUser(
    process.env.DEMO_STUDENT_EMAIL ?? instructorEmail,
  );
  await staffEnrollStudent(prisma, {
    courseId: course.id,
    email: student.email,
    actorId,
  });
  await saveAttendance(prisma, {
    lectureId: lectureIds[0],
    actorId,
    entries: [{ userId: student.id, status: "PRESENT" }],
  });
  await saveAttendance(prisma, {
    lectureId: lectureIds[1],
    actorId,
    entries: [{ userId: student.id, status: "PARTIAL", minutesAttended: 70 }],
  });

  console.log(`Demo course ready: /ar/courses/${SLUG}`);
  console.log(
    `${student.email} is enrolled: /ar/my-courses  (attendance recorded for lectures 1 and 2)`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
