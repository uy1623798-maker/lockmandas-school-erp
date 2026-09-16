import { Role } from '@prisma/client';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { allow, asyncRoute, auth, prisma } from '../lib.js';

export const adminRouter = Router();
adminRouter.use(auth, allow(Role.ADMIN));

const id = z.string().cuid();
const schemas = {
  subjects: z.object({ name: z.string().trim().min(1).max(100), code: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/) }).strict(),
  classes: z.object({ name: z.string().trim().min(1).max(50), section: z.string().trim().min(1).max(20), academicYearId: id }).strict(),
  academicYears: z.object({ name: z.string().trim().min(1).max(30), startsOn: z.coerce.date(), endsOn: z.coerce.date(), active: z.boolean().optional() }).strict(),
  timetable: z.object({ classId: id, subjectId: id, teacherId: id, dayOfWeek: z.number().int().min(1).max(7), period: z.number().int().min(1).max(20), startsAt: z.string().trim().min(1).max(20), endsAt: z.string().trim().min(1).max(20) }).strict(),
  assignments: z.object({ teacherId: id, classId: id, subjectId: id }).strict(),
};
const configs: any = {
  subjects: { model: prisma.subject, schema: schemas.subjects },
  classes: { model: prisma.class, schema: schemas.classes },
  academicYears: { model: prisma.academicYear, schema: schemas.academicYears },
  timetable: { model: prisma.timetableEntry, schema: schemas.timetable },
  assignments: { model: prisma.teachingAssignment, schema: schemas.assignments },
};

for (const [path, config] of Object.entries(configs) as any) {
  const { model, schema } = config;
  adminRouter.get(`/${path}`, asyncRoute(async (_q: any, r: any) => r.json(await model.findMany())));
  adminRouter.post(`/${path}`, asyncRoute(async (q: any, r: any) => r.status(201).json(await model.create({ data: schema.parse(q.body) }))));
  adminRouter.patch(`/${path}/:id`, asyncRoute(async (q: any, r: any) => r.json(await model.update({ where: { id: q.params.id }, data: schema.partial().parse(q.body) }))));
  adminRouter.delete(`/${path}/:id`, asyncRoute(async (q: any, r: any) => {
    await model.delete({ where: { id: q.params.id } });
    r.status(204).end();
  }));
}

adminRouter.get('/teachers', asyncRoute(async (_q: any, r: any) => r.json(await prisma.teacher.findMany({
  include: { user: { select: { id: true, name: true, username: true, email: true, role: true, avatarUrl: true, createdAt: true, updatedAt: true } }, assignments: { include: { class: true, subject: true } } },
}))));
adminRouter.get('/students', asyncRoute(async (_q: any, r: any) => r.json(await prisma.student.findMany({
  include: { user: { select: { id: true, name: true, username: true, email: true, role: true, avatarUrl: true, createdAt: true, updatedAt: true } }, class: true },
}))));

const optionalText = z.string().trim().optional().nullable();
const issueInitialPassword = () => `${crypto.randomBytes(9).toString('base64url')}Aa1!`;
const strongPassword = z.string().min(12).max(128)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), 'Password must contain letters and numbers');

function attendanceClassIds(classesTaught: string | null | undefined, classes: Array<{ id: string; name: string }>) {
  const tokens = new Set(String(classesTaught || '').toUpperCase().split(',').map((value) => value.trim()).filter(Boolean));
  const grades = new Set([...tokens].filter((value) => /^\d{1,2}$/.test(value)).map(Number));
  const includesKg = tokens.has('KG');
  return classes.filter((schoolClass) => {
    const match = schoolClass.name.match(/^Class\s+(\d{1,2})$/i);
    if (match && grades.has(Number(match[1]))) return true;
    return includesKg && /^(Nursery|LKG|UKG)$/i.test(schoolClass.name);
  }).map((schoolClass) => schoolClass.id);
}
const importTeacherSchema = z.object({
  employeeNo: z.string().trim().min(1),
  name: z.string().trim().min(1),
  phone: optionalText,
  gender: optionalText,
  dateOfBirth: z.string().date(),
  designation: optionalText,
  qualification: optionalText,
  professionalQualification: optionalText,
  computerKnowledge: optionalText,
  classesTaught: optionalText,
  bankName: optionalText,
  bankAccountNo: optionalText,
  bankIfsc: optionalText,
  class10Subject1: optionalText,
  class10Experience1: optionalText,
  class10Subject2: optionalText,
  class10Experience2: optionalText,
  class12Subject1: optionalText,
  class12Experience1: optionalText,
  class12Subject2: optionalText,
  class12Experience2: optionalText,
  wardAppear10: z.boolean().default(false),
  wardAppear12: z.boolean().default(false),
  evaluationMedium: optionalText,
  specialEdRciNo: optionalText,
  teachingShift: optionalText,
});

adminRouter.post('/teachers/import', asyncRoute(async (q: any, r: any) => {
  const body = z.object({ teachers: z.array(importTeacherSchema).min(1).max(100) }).parse(q.body);
  let created = 0;
  let updated = 0;
  const credentials: Array<{ employeeNo: string; password: string }> = [];
  const [attendanceSubject, classes] = await Promise.all([
    prisma.subject.findUnique({ where: { code: 'CLASS-ATT' } }),
    prisma.class.findMany({ select: { id: true, name: true } }),
  ]);

  await prisma.$transaction(async (tx) => {
    for (const teacher of body.teachers) {
      const existing = await tx.teacher.findUnique({ where: { employeeNo: teacher.employeeNo } });
      const initialPassword = existing ? null : issueInitialPassword();
      const account = existing
        ? await tx.user.update({
          where: { id: existing.userId },
          data: { name: teacher.name, username: teacher.employeeNo, role: Role.TEACHER },
        })
        : await tx.user.create({
          data: { name: teacher.name, username: teacher.employeeNo, email: `teacher_${teacher.employeeNo}@lokmandas.edu`, passwordHash: await bcrypt.hash(initialPassword!, 12), role: Role.TEACHER },
        });
      if (initialPassword) credentials.push({ employeeNo: teacher.employeeNo, password: initialPassword });
      const { name: _name, dateOfBirth, ...profile } = teacher;
      const data = { ...profile, dateOfBirth: new Date(`${dateOfBirth}T00:00:00.000Z`) };
      let teacherRecord;
      if (existing) {
        teacherRecord = await tx.teacher.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        teacherRecord = await tx.teacher.create({ data: { userId: account.id, ...data } });
        created += 1;
      }
      const classIds = attendanceClassIds(teacher.classesTaught, classes);
      if (attendanceSubject && classIds.length) {
        await tx.teachingAssignment.createMany({
          data: classIds.map((classId) => ({ teacherId: teacherRecord.id, classId, subjectId: attendanceSubject.id })),
          skipDuplicates: true,
        });
      }
    }
  }, { timeout: 30000 });

  r.status(201).json({ created, updated, credentials });
}));

adminRouter.post('/teachers/backfill-attendance-assignments', asyncRoute(async (_q: any, r: any) => {
  const [attendanceSubject, classes, teachers] = await Promise.all([
    prisma.subject.findUnique({ where: { code: 'CLASS-ATT' } }),
    prisma.class.findMany({ select: { id: true, name: true } }),
    prisma.teacher.findMany({ select: { id: true, classesTaught: true } }),
  ]);
  if (!attendanceSubject) return r.status(400).json({ message: 'Class Attendance subject is missing' });
  const data = teachers.flatMap((teacher) => attendanceClassIds(teacher.classesTaught, classes)
    .map((classId) => ({ teacherId: teacher.id, classId, subjectId: attendanceSubject.id })));
  const result = data.length ? await prisma.teachingAssignment.createMany({ data, skipDuplicates: true }) : { count: 0 };
  r.json({ created: result.count, teachersMatched: teachers.filter((teacher) => attendanceClassIds(teacher.classesTaught, classes).length).length });
}));

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
  let created = 0;
  let updated = 0;
  const credentials: Array<{ admissionNo: string; password: string }> = [];

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
        const initialPassword = issueInitialPassword();
        const user = await tx.user.create({
          data: {
            name: student.name,
            username: `student_${key}`,
            email: `student_${key}@lokmandas.edu`,
            passwordHash: await bcrypt.hash(initialPassword, 12),
            role: Role.STUDENT,
          },
        });
        await tx.student.create({
          data: { userId: user.id, admissionNo: student.admissionNo, ...studentData },
        });
        credentials.push({ admissionNo: student.admissionNo, password: initialPassword });
        created += 1;
      }
    }
  }, { timeout: 30000 });

  return r.status(201).json({ classId: schoolClass.id, created, updated, credentials });
}));

adminRouter.post('/students/set-passwords', asyncRoute(async (q: any, r: any) => {
  const body = z.object({ credentials: z.array(z.object({ admissionNo: z.string().trim().min(1), password: strongPassword })).min(1).max(25) }).strict().parse(q.body);
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
    name: z.string().trim().min(1).max(100), username: z.string().trim().min(3).max(80), email: z.string().trim().email().max(254), password: strongPassword,
    role: z.enum(['TEACHER', 'STUDENT']), employeeNo: z.string().optional(), admissionNo: z.string().optional(),
    classId: z.string().optional(), rollNo: z.number().optional(), parentContact: z.string().optional(),
  }).strict().superRefine((value, ctx) => {
    if (value.role === 'TEACHER' && !value.employeeNo) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['employeeNo'], message: 'Employee number is required' });
    if (value.role === 'STUDENT' && (!value.admissionNo || !value.classId || !value.rollNo)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['admissionNo'], message: 'Admission number, class, and roll number are required' });
  }).parse(q.body);
  const result = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { name: b.name, username: b.username, email: b.email.toLowerCase(), passwordHash: await bcrypt.hash(b.password, 12), role: b.role } });
    if (b.role === 'TEACHER') await tx.teacher.create({ data: { userId: u.id, employeeNo: b.employeeNo! } });
    else await tx.student.create({ data: { userId: u.id, admissionNo: b.admissionNo!, classId: b.classId!, rollNo: b.rollNo!, parentContact: b.parentContact } });
    return { id: u.id, name: u.name, username: u.username, email: u.email, role: u.role, createdAt: u.createdAt };
  });
  r.status(201).json(result);
}));
