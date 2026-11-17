// lib/notifications/templates.ts
// The text of every notification, in both languages. One source for the in-app list AND the
// emails (so a wording change is made once). Placeholders look like {course}.
// Avoid an apostrophe directly before a placeholder.

type Item = { title: string; body: string };
export type Templates = { common: Record<string, string>; items: Record<string, Item> };

export const TEMPLATES: Record<"ar" | "en", Templates> = {
  ar: {
    common: {
      lectureLabel: "المحاضرة {number}",
      dueOn: "آخر موعد: {date}",
      noDeadline: "بلا موعد نهائي",
      openLink: "فتح في المنصة",
      emailFooter: "وصلتك هذه الرسالة لأنك مسجّل في المنصة. يمكنك إيقاف إشعارات البريد من صفحة الإشعارات.",
      unknownTitle: "إشعار جديد",
    },
    items: {
      enrollment_confirmed: {
        title: "تم تسجيلك في {course}",
        body: "أهلًا بك! ستجد المحاضرات والأسئلة وتقدّمك كلها في «دوراتي».",
      },
      lecture_upcoming_24h: {
        title: "{lecture} قريبًا",
        body: "{course} · {date}. تجد رابط Zoom في صفحة المحاضرة.",
      },
      lecture_upcoming_1h: {
        title: "{lecture} تبدأ خلال ساعة",
        body: "{course} · {date}. رابط Zoom في صفحة المحاضرة.",
      },
      question_published: {
        title: "سؤال جديد بعد {lecture}",
        body: "{course}. {due}",
      },
      question_due_soon: {
        title: "اقترب موعد تسليم سؤال",
        body: "{course} · {lecture}. {due}. لم تُسلّم إجابتك بعد.",
      },
      question_graded: {
        title: "صُحّحت إجابتك",
        body: "{course} · {lecture}. افتح السؤال لترى درجتك والملاحظات.",
      },
      exam_published: {
        title: "الامتحان متاح الآن",
        body: "{course}. {due}",
      },
      exam_closing_soon: {
        title: "اقترب إغلاق الامتحان",
        body: "{course}. {due}. لم تُسلّم أي محاولة بعد.",
      },
      exam_results_released: {
        title: "نتيجة الامتحان جاهزة",
        body: "{course}. افتح المحاولة لترى درجتك.",
      },
      recording_added: {
        title: "تسجيل جديد: {lecture}",
        body: "{course}",
      },
      certificate_approved: {
        title: "اعتُمد طلب شهادتك",
        body: "{course}. ستُصدر الجهة المانحة الشهادة وتتواصل معك.",
      },
    },
  },
  en: {
    common: {
      lectureLabel: "Lecture {number}",
      dueOn: "Due: {date}",
      noDeadline: "No deadline",
      openLink: "Open on the platform",
      emailFooter: "You received this because you are enrolled on the platform. You can turn email notifications off on the notifications page.",
      unknownTitle: "New notification",
    },
    items: {
      enrollment_confirmed: {
        title: "You are enrolled in {course}",
        body: "Welcome! Your lectures, questions and progress are all in My courses.",
      },
      lecture_upcoming_24h: {
        title: "{lecture} is coming up",
        body: "{course} · {date}. The Zoom link is on the lecture page.",
      },
      lecture_upcoming_1h: {
        title: "{lecture} starts within the hour",
        body: "{course} · {date}. The Zoom link is on the lecture page.",
      },
      question_published: {
        title: "New question after {lecture}",
        body: "{course}. {due}",
      },
      question_due_soon: {
        title: "A question deadline is close",
        body: "{course} · {lecture}. {due}. You have not submitted an answer yet.",
      },
      question_graded: {
        title: "Your answer was graded",
        body: "{course} · {lecture}. Open the question to see your score and feedback.",
      },
      exam_published: {
        title: "The exam is open",
        body: "{course}. {due}",
      },
      exam_closing_soon: {
        title: "The exam closes soon",
        body: "{course}. {due}. You have not submitted an attempt yet.",
      },
      exam_results_released: {
        title: "Your exam result is ready",
        body: "{course}. Open the attempt to see your score.",
      },
      recording_added: {
        title: "New recording: {lecture}",
        body: "{course}",
      },
      certificate_approved: {
        title: "Your certificate request was approved",
        body: "{course}. The certifying organization will issue the certificate and contact you.",
      },
    },
  },
};
