// prisma/seed.ts
// Idempotent: safe to run repeatedly. It only ADDS missing permissions, roles and
// role-permission links. It never removes links, so permission changes you make to
// roles in the admin UI are preserved.
//
// Run: npx prisma db seed

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";
// ADJUST THIS IMPORT to match the `output` path in your generator block
// (Prisma 7 generates the client into your project, e.g. "../generated/prisma/client").

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
});

const GENERAL_ORG_ID = "00000000-0000-0000-0000-000000000001";

const PERMISSIONS: Record<string, string> = {
  "course.create": "Create courses",
  "course.edit": "Edit course information and settings",
  "course.publish": "Publish / unpublish courses",
  "course.archive": "Archive courses",

  "lecture.create": "Create lectures",
  "lecture.edit": "Edit lectures and Zoom details",
  "lecture.delete": "Delete lectures",
  "recording.manage": "Add and manage recordings",
  "material.manage": "Add and manage course materials",

  "attendance.view": "View attendance",
  "attendance.edit": "Record and edit attendance",
  "attendance.import": "Import attendance",

  "question.create": "Create lecture questions",
  "question.edit": "Edit lecture questions",
  "submission.view": "View student submissions",
  "submission.grade": "Grade lecture-question submissions",
  "submission.extend":
    "Grant excuses, deadline extensions and reopen submissions",

  "exam.create": "Create exams",
  "exam.edit": "Edit exams",
  "exam.grade": "Grade exam answers",
  "exam.reopen": "Reopen exams / grant extra attempts",

  "student.view": "View students",
  "enrollment.manage": "Manage enrollments",

  "certificate.view": "View certificate eligibility",
  "certificate.review": "Approve or reject certificate candidates",
  "certificate.export": "Export eligible students",
  "certificate.configure": "Change certificate requirements",

  "report.view": "View reports",
  "audit.view": "View audit logs",

  "user.manage": "Manage users",
  "role.manage": "Manage roles and permissions",
  "settings.manage": "Manage system settings and integrations",
};

const ALL = Object.keys(PERMISSIONS);

const ROLES: { key: string; name: string; permissions: string[] }[] = [
  { key: "owner", name: "Owner", permissions: ALL },
  {
    key: "instructor",
    name: "Instructor",
    permissions: ALL.filter(
      (p) => !["user.manage", "role.manage", "settings.manage"].includes(p),
    ),
  },
  {
    // Deliberately excludes exam.grade, exam.reopen, certificate.* and anything destructive.
    // The owner can add exam.grade to individual assistants.
    key: "assistant",
    name: "Assistant",
    permissions: [
      "student.view",
      "enrollment.manage",
      "attendance.view",
      "attendance.edit",
      "submission.view",
      "submission.grade",
      "lecture.create",
      "lecture.edit",
      "recording.manage",
      "material.manage",
    ],
  },
  { key: "student", name: "Student", permissions: [] },
];

async function main() {
  // Safety net: the org row is also inserted by post_init.sql
  await prisma.organization.upsert({
    where: { id: GENERAL_ORG_ID },
    update: {},
    create: { id: GENERAL_ORG_ID, slug: "general", name: "General" },
  });

  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }
  const permissionRows = await prisma.permission.findMany();
  const permissionId = new Map(permissionRows.map((p) => [p.key, p.id]));

  for (const role of ROLES) {
    const row = await prisma.role.upsert({
      where: {
        organizationId_key: { organizationId: GENERAL_ORG_ID, key: role.key },
      },
      update: {},
      create: {
        organizationId: GENERAL_ORG_ID,
        key: role.key,
        name: role.name,
        isSystem: true,
      },
    });

    await prisma.rolePermission.createMany({
      data: role.permissions.map((key) => ({
        roleId: row.id,
        permissionId: permissionId.get(key)!,
      })),
      skipDuplicates: true,
    });
  }

  // Optional bootstrap: give the owner role to an existing user.
  // Register on the site first (this creates the users row), then run the seed with
  //   SEED_OWNER_EMAIL=you@example.com npx prisma db seed
  const ownerEmail = process.env.SEED_OWNER_EMAIL;
  if (ownerEmail) {
    const user = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (!user) {
      console.warn(
        `No user with email ${ownerEmail} yet. Register first, then re-run.`,
      );
    } else {
      const ownerRole = await prisma.role.findUniqueOrThrow({
        where: {
          organizationId_key: { organizationId: GENERAL_ORG_ID, key: "owner" },
        },
      });
      const existing = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId: ownerRole.id, courseId: null },
      });
      if (!existing) {
        await prisma.userRole.create({
          data: { userId: user.id, roleId: ownerRole.id },
        });
      }
      console.log(`Owner role granted to ${ownerEmail}`);
    }
  }

  console.log(`Seeded ${ALL.length} permissions and ${ROLES.length} roles.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
