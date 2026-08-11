import { Role } from '@prisma/client';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { allow, asyncRoute, auth, prisma } from '../lib.js';

export const adminRouter = Router();
adminRouter.use(auth, allow(Role.ADMIN));

const configs: any = {
  subjects: prisma.subject,
  classes: prisma.class,
  academicYears: prisma.academicYear,
  timetable: prisma.timetableEntry,
  assignments: prisma.teachingAssignment,
};

for (const [path, model] of Object.entries(configs) as any) {
  adminRouter.get(`/${path}`, asyncRoute(async (_q: any, r: any) => r.json(await model.findMany())));
  adminRouter.post(`/${path}`, asyncRoute(async (q: any, r: any) => r.status(201).json(await model.create({ data: q.body }))));
  adminRouter.patch(`/${path}/:id`, asyncRoute(async (q: any, r: any) => r.json(await model.update({ where: { id: q.params.id }, data: q.body }))));
  adminRouter.delete(`/${path}/:id`, asyncRoute(async (q: any, r: any) => {
    await model.delete({ where: { id: q.params.id } });
    r.status(204).end();
  }));
}

adminRouter.get('/teachers', asyncRoute(async (_q: any, r: any) => r.json(await prisma.teacher.findMany({
  include: { user: true, assignments: { include: { class: true, subject: true } } },
}))));
adminRouter.get('/students', asyncRoute(async (_q: any, r: any) => r.json(await prisma.student.findMany({
  include: { user: true, class: true },
}))));

const importStudentSchema = z.object({
  admissionNo: z.string().trim().min(1),
  sourceAdmissionNo: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1),
  rollNo: z.number().int().positive(),
  dateOfBirth: z.string().date().optional().nullable(),
  fatherName: z.string().trim().optional().nullable(),
  motherName: z.string().trim().optional().nullable(),
  parentContact: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  aadhaarNo: z.string().trim().optional().nullable(),
  penNo: z.string().trim().optional().nullable(),
});

const importSchema = z.object({
  className: z.string().trim().min(1),
  section: z.string().trim().min(1),
  academicYear: z.string().trim().default('2026-27'),
  replaceExistingClass: z.boolean().default(false),
  students: z.array(importStudentSchema).min(1).max(100),
});

function accountKey(admissionNo: string) {
  return admissionNo.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

adminRouter.post('/students/import', asyncRoute(async (q: any, r: any) => {
  const body = importSchema.parse(q.body);
  const year = await prisma.academicYear.findUnique({ where: { name: body.academicYear } });
  if (!year) return r.status(400).json({ message: `Academic year ${body.academicYear} does not exist` });

  const schoolClass = await prisma.class.upsert({
    where: { name_section_academicYearId: { name: body.className, section: body.section, academicYearId: year.id } },
    update: {},
    create: { name: body.className, section: body.section, academicYearId: year.id },
  });
  const passwordHash = await bcrypt.hash('School@123', 12);
  let created = 0;
  let updated = 0;

  if (body.replaceExistingClass) {
    const existingUsers = await prisma.student.findMany({
      where: { classId: schoolClass.id },
      select: { userId: true },
    });
    if (existingUsers.length) {
      await prisma.user.deleteMany({ where: { id: { in: existingUsers.map(({ userId }) => userId) } } });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const student of body.students) {
      const existing = await tx.student.findUnique({ where: { admissionNo: student.admissionNo } });
      const studentData = {
        classId: schoolClass.id,
        rollNo: student.rollNo,
        sourceAdmissionNo: student.sourceAdmissionNo || null,
        dateOfBirth: student.dateOfBirth ? new Date(`${student.dateOfBirth}T00:00:00.000Z`) : null,
        fatherName: student.fatherName || null,
        motherName: student.motherName || null,
        parentName: student.fatherName || null,
        parentContact: student.parentContact || null,
        address: student.address || null,
        aadhaarNo: student.aadhaarNo || null,
        penNo: student.penNo || null,
      };

      if (existing) {
        await tx.student.update({ where: { id: existing.id }, data: studentData });
        await tx.user.update({ where: { id: existing.userId }, data: { name: student.name } });
        updated += 1;
      } else {
        const key = accountKey(student.admissionNo);
        const user = await tx.user.create({
          data: {
            name: student.name,
            username: `student_${key}`,
            email: `student_${key}@lockmandas.edu`,
            passwordHash,
            role: Role.STUDENT,
          },
        });
        await tx.student.create({
          data: { userId: user.id, admissionNo: student.admissionNo, ...studentData },
        });
        created += 1;
      }
    }
  }, { timeout: 30000 });

  return r.status(201).json({ classId: schoolClass.id, created, updated });
}));

adminRouter.post('/students/set-passwords', asyncRoute(async (q: any, r: any) => {
  const body = z.object({ credentials: z.array(z.object({ admissionNo: z.string().min(1), password: z.string().length(8).regex(/^\d{8}$/) })).min(1).max(25) }).parse(q.body);
  const admissionNos = body.credentials.map((credential) => credential.admissionNo);
  const students = await prisma.student.findMany({ where: { admissionNo: { in: admissionNos } }, select: { admissionNo: true, userId: true } });
  if (students.length !== body.credentials.length) return r.status(400).json({ message: 'One or more admission numbers were not found' });
  const userByAdmission = new Map(students.map((student) => [student.admissionNo, student.userId]));
  // Cost 10 keeps bulk student credential provisioning within hosted request limits
  // while still storing a deliberately slow bcrypt hash (never the DOB itself).
  const updates = await Promise.all(body.credentials.map(async (credential) => ({ userId: userByAdmission.get(credential.admissionNo)!, passwordHash: await bcrypt.hash(credential.password, 10) })));
  await prisma.$transaction(updates.map((update) => prisma.user.update({ where: { id: update.userId }, data: { passwordHash: update.passwordHash, refreshTokenHash: null, resetTokenHash: null, resetTokenExpires: null } })));
  r.json({ updated: updates.length });
}));

adminRouter.post('/people', asyncRoute(async (q: any, r: any) => {
  const b = z.object({
    name: z.string(), username: z.string(), email: z.string().email(), password: z.string().min(8),
    role: z.enum(['TEACHER', 'STUDENT']), employeeNo: z.string().optional(), admissionNo: z.string().optional(),
    classId: z.string().optional(), rollNo: z.number().optional(), parentContact: z.string().optional(),
  }).parse(q.body);
  const result = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { name: b.name, username: b.username, email: b.email.toLowerCase(), passwordHash: await bcrypt.hash(b.password, 12), role: b.role } });
    if (b.role === 'TEACHER') await tx.teacher.create({ data: { userId: u.id, employeeNo: b.employeeNo! } });
    else await tx.student.create({ data: { userId: u.id, admissionNo: b.admissionNo!, classId: b.classId!, rollNo: b.rollNo!, parentContact: b.parentContact } });
    return u;
  });
  r.status(201).json(result);
}));
