import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { PRIVATE, json, parseJson, route, uuidParam } from "@/lib/api/handler";
import { courseIdOfMaterial } from "@/lib/api/resolve";
import { updateMaterialSchema } from "@/lib/validation/staff";
import { deleteMaterial, updateMaterial } from "@/lib/staff/media";

export const PATCH = route<{ materialId: string }>(async (req, { params }) => {
  const user = await requireUser();
  const materialId = uuidParam(params.materialId);
  await requirePermission(user, "material.manage", await courseIdOfMaterial(materialId));
  const input = await parseJson(req, updateMaterialSchema);
  return json(await updateMaterial(db, { materialId, input, actorId: user.id }), 200, PRIVATE);
});

export const DELETE = route<{ materialId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const materialId = uuidParam(params.materialId);
  await requirePermission(user, "material.manage", await courseIdOfMaterial(materialId));
  return json(await deleteMaterial(db, { materialId, actorId: user.id }), 200, PRIVATE);
});
