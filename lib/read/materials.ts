// lib/read/materials.ts
// Who may download a material, decided with the same visibility rules as recordings.
// A material the viewer may not see looks exactly like one that does not exist.

// ADJUST this import to your generator `output` path (same as the other files).
import type { PrismaClient } from "@/generated/prisma/client";
import { GradingError } from "../grading/grading";
import { canSeeByVisibility } from "./visibility";

export type MaterialAccess =
  | { kind: "storage"; path: string; downloadName: string }
  | { kind: "external"; url: string };

const safeName = (s: string) => s.replace(/[\\/"\r\n]/g, " ").trim().slice(0, 120) || "file";

export async function getMaterialAccess(
  db: PrismaClient,
  args: { materialId: string; viewerId: string | null },
): Promise<MaterialAccess> {
  const m = await db.material.findFirst({
    where: { id: args.materialId, status: "PUBLISHED", deletedAt: null },
    select: {
      titleAr: true, storagePath: true, externalUrl: true, visibility: true, courseId: true, lectureId: true,
      lecture: { select: { status: true, deletedAt: true } },
      course: { select: { status: true } },
    },
  });
  if (!m || m.course.status === "DRAFT") throw new GradingError("NOT_FOUND");
  if (m.lectureId && (!m.lecture || m.lecture.status !== "PUBLISHED" || m.lecture.deletedAt)) {
    throw new GradingError("NOT_FOUND");
  }

  let enrolled = false;
  if (args.viewerId) {
    const e = await db.enrollment.findUnique({
      where: { userId_courseId: { userId: args.viewerId, courseId: m.courseId } },
      select: { status: true },
    });
    enrolled = e?.status === "ACTIVE";
  }
  if (m.course.status === "ARCHIVED" && !enrolled) throw new GradingError("NOT_FOUND");
  if (!canSeeByVisibility(m.visibility, { signedIn: args.viewerId != null, enrolled })) {
    throw new GradingError("NOT_FOUND");
  }

  if (m.storagePath) {
    const ext = m.storagePath.split(".").pop() ?? "";
    return { kind: "storage", path: m.storagePath, downloadName: `${safeName(m.titleAr)}.${ext}` };
  }
  if (m.externalUrl) return { kind: "external", url: m.externalUrl };
  throw new GradingError("NOT_FOUND");
}
