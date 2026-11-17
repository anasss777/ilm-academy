// lib/staff/media.ts
// Recordings and course materials. Routes verify recording.manage / material.manage first.

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { GradingError } from "../grading/grading";
import type {
  CreateMaterialInput,
  CreateRecordingInput,
  UpdateMaterialInput,
  UpdateRecordingInput,
} from "../validation/staff";
import { isStoragePathForCourse } from "../storage/rules";
import { audit, inTx } from "./common";
import { deriveEmbedUrl, isSafeStoragePath, validateExternalUrl, type RecordingProvider } from "./rules";

const blank = (v: string | null | undefined) => v?.trim() || null;

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

export async function createRecording(
  db: PrismaClient,
  args: { lectureId: string; input: CreateRecordingInput; actorId: string },
) {
  const { lectureId, input, actorId } = args;
  // Validate before opening a transaction: a bad link is the common failure
  const url = validateExternalUrl(input.provider, input.url);
  const embedUrl = deriveEmbedUrl(input.provider, url);

  return inTx(db, async (tx) => {
    const lecture = await tx.lecture.findFirst({
      where: { id: lectureId, deletedAt: null },
      select: { id: true, course: { select: { settings: { select: { recordingsVisibility: true } } } } },
    });
    if (!lecture) throw new GradingError("NOT_FOUND");

    const position =
      input.position ??
      ((await tx.recording.aggregate({ where: { lectureId }, _max: { position: true } }))._max.position ?? -1) + 1;
    const status = input.status ?? "DRAFT";

    const row = await tx.recording.create({
      data: {
        lectureId,
        provider: input.provider,
        url,
        embedUrl,
        titleAr: blank(input.titleAr),
        titleEn: blank(input.titleEn),
        durationSeconds: input.durationSeconds ?? null,
        position,
        visibility: input.visibility ?? lecture.course.settings?.recordingsVisibility ?? "PUBLIC",
        status,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
      },
      select: { id: true, provider: true, embedUrl: true, status: true, visibility: true },
    });
    await audit(tx, {
      actorId, action: "recording.create", entityType: "Recording", entityId: row.id,
      metadata: { lectureId, provider: input.provider },
    });
    return row;
  });
}

export async function updateRecording(
  db: PrismaClient,
  args: { recordingId: string; input: UpdateRecordingInput; actorId: string },
) {
  const { recordingId, input, actorId } = args;

  return inTx(db, async (tx) => {
    const existing = await tx.recording.findUnique({
      where: { id: recordingId },
      select: { provider: true, url: true, publishedAt: true },
    });
    if (!existing) throw new GradingError("NOT_FOUND");

    const data: Prisma.RecordingUncheckedUpdateInput = {};
    // Changing either the provider or the link re-validates the pair and re-derives the embed
    if (input.provider !== undefined || input.url !== undefined) {
      const provider = (input.provider ?? existing.provider) as RecordingProvider;
      const url = validateExternalUrl(provider, input.url ?? existing.url);
      data.provider = provider;
      data.url = url;
      data.embedUrl = deriveEmbedUrl(provider, url);
    }
    if (input.titleAr !== undefined) data.titleAr = blank(input.titleAr);
    if (input.titleEn !== undefined) data.titleEn = blank(input.titleEn);
    if (input.durationSeconds !== undefined) data.durationSeconds = input.durationSeconds;
    if (input.position !== undefined) data.position = input.position;
    if (input.visibility !== undefined) data.visibility = input.visibility;
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === "PUBLISHED" && !existing.publishedAt) data.publishedAt = new Date();
    }

    const row = await tx.recording.update({
      where: { id: recordingId },
      data,
      select: { id: true, provider: true, embedUrl: true, status: true, visibility: true },
    });
    await audit(tx, {
      actorId, action: "recording.update", entityType: "Recording", entityId: recordingId,
      metadata: { fields: Object.keys(data) },
    });
    return row;
  });
}

export async function deleteRecording(db: PrismaClient, args: { recordingId: string; actorId: string }) {
  return inTx(db, async (tx) => {
    const existing = await tx.recording.findUnique({
      where: { id: args.recordingId },
      select: { id: true, lectureId: true, url: true },
    });
    if (!existing) throw new GradingError("NOT_FOUND");
    await tx.recording.delete({ where: { id: args.recordingId } });
    await audit(tx, {
      actorId: args.actorId, action: "recording.delete", entityType: "Recording", entityId: args.recordingId,
      metadata: { lectureId: existing.lectureId, url: existing.url },
    });
    return { id: args.recordingId };
  });
}

// ---------------------------------------------------------------------------
// Materials (PDFs, documents)
// ---------------------------------------------------------------------------

function checkMaterialSource(storagePath: string | null, externalUrl: string | null) {
  if (!storagePath && !externalUrl) {
    throw new GradingError("INVALID_URL", "Provide a storagePath or an externalUrl");
  }
  if (storagePath && !isSafeStoragePath(storagePath)) throw new GradingError("INVALID_URL", "Invalid storage path");
  return externalUrl ? validateExternalUrl("OTHER", externalUrl) : null;
}

export async function createMaterial(
  db: PrismaClient,
  args: { courseId: string; input: CreateMaterialInput; actorId: string },
) {
  const { courseId, input, actorId } = args;
  const storagePath = blank(input.storagePath);
  if (storagePath && !isStoragePathForCourse("material", storagePath, courseId)) {
    throw new GradingError("INVALID_URL", "That file does not belong to this course");
  }
  const externalUrl = checkMaterialSource(storagePath, blank(input.externalUrl));

  return inTx(db, async (tx) => {
    const course = await tx.course.findUnique({
      where: { id: courseId },
      select: { settings: { select: { materialsVisibility: true } } },
    });
    if (!course) throw new GradingError("NOT_FOUND");

    if (input.lectureId) {
      const lecture = await tx.lecture.findFirst({
        where: { id: input.lectureId, courseId, deletedAt: null },
        select: { id: true },
      });
      if (!lecture) throw new GradingError("NOT_FOUND", "Lecture does not belong to this course");
    }

    const position =
      input.position ??
      ((await tx.material.aggregate({ where: { courseId, deletedAt: null }, _max: { position: true } }))._max.position ?? -1) + 1;

    const row = await tx.material.create({
      data: {
        courseId,
        lectureId: input.lectureId ?? null,
        titleAr: input.titleAr.trim(),
        titleEn: blank(input.titleEn),
        type: input.type,
        storagePath,
        externalUrl,
        visibility: input.visibility ?? course.settings?.materialsVisibility ?? "PUBLIC",
        status: input.status ?? "DRAFT",
        position,
      },
      select: { id: true, type: true, status: true, visibility: true },
    });
    await audit(tx, {
      actorId, action: "material.create", entityType: "Material", entityId: row.id,
      metadata: { courseId, lectureId: input.lectureId ?? null },
    });
    return row;
  });
}

export async function updateMaterial(
  db: PrismaClient,
  args: { materialId: string; input: UpdateMaterialInput; actorId: string },
) {
  const { materialId, input, actorId } = args;

  return inTx(db, async (tx) => {
    const existing = await tx.material.findFirst({
      where: { id: materialId, deletedAt: null },
      select: { courseId: true, storagePath: true, externalUrl: true },
    });
    if (!existing) throw new GradingError("NOT_FOUND");

    const data: Prisma.MaterialUncheckedUpdateInput = {};
    if (input.storagePath !== undefined || input.externalUrl !== undefined) {
      const storagePath = input.storagePath === undefined ? existing.storagePath : blank(input.storagePath);
      const rawUrl = input.externalUrl === undefined ? existing.externalUrl : blank(input.externalUrl);
      if (storagePath && !isStoragePathForCourse("material", storagePath, existing.courseId)) {
        throw new GradingError("INVALID_URL", "That file does not belong to this course");
      }
      data.storagePath = storagePath;
      data.externalUrl = checkMaterialSource(storagePath, rawUrl);
    }
    if (input.titleAr !== undefined) data.titleAr = input.titleAr.trim();
    if (input.titleEn !== undefined) data.titleEn = blank(input.titleEn);
    if (input.type !== undefined) data.type = input.type;
    if (input.visibility !== undefined) data.visibility = input.visibility;
    if (input.status !== undefined) data.status = input.status;
    if (input.position !== undefined) data.position = input.position;

    const row = await tx.material.update({
      where: { id: materialId },
      data,
      select: { id: true, type: true, status: true, visibility: true },
    });
    await audit(tx, {
      actorId, action: "material.update", entityType: "Material", entityId: materialId,
      metadata: { fields: Object.keys(data) },
    });
    return row;
  });
}

export async function deleteMaterial(db: PrismaClient, args: { materialId: string; actorId: string }) {
  return inTx(db, async (tx) => {
    const existing = await tx.material.findFirst({
      where: { id: args.materialId, deletedAt: null },
      select: { id: true, courseId: true },
    });
    if (!existing) throw new GradingError("NOT_FOUND");
    await tx.material.update({ where: { id: args.materialId }, data: { deletedAt: new Date() } });
    await audit(tx, {
      actorId: args.actorId, action: "material.delete", entityType: "Material", entityId: args.materialId,
      metadata: { courseId: existing.courseId },
    });
    return { id: args.materialId };
  });
}
