import { AttendanceState, AttendanceStatus, Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { generateAttendancePdf } from '../attendancePdf.js';
import { allow, asyncRoute, auth, prisma } from '../lib.js';

export const attendanceRouter = Router();
attendanceRouter.use(auth);

attendanceRouter.get('/teacher/classes', allow(Role.TEACHER), asyncRoute(async (req: any, res: any) => {
  const teacher = await prisma.teacher.findUnique({ where: { userId: req.user.id } });
  const rows = await prisma.teachingAssignment.findMany({ where: { teacherId: teacher!.id }, include: { class: true, subject: true } });
  res.json(rows);
}));

attendanceRouter.get('/register', allow(Role.TEACHER, Role.ADMIN), asyncRoute(async (req: any, res: any) => {
  const query = z.object({ classId: z.string(), subjectId: z.string(), date: z.coerce.date(), period: z.coerce.number().int().min(1) }).parse(req.query);
  if (req.user.role === Role.TEACHER) {
    const teacher = await prisma.teacher.findUnique({ where: { userId: req.user.id } });
    const assigned = await prisma.teachingAssignment.findFirst({ where: { teacherId: teacher!.id, classId: query.classId, subjectId: query.subjectId } });
    if (!assigned) return res.status(403).json({ message: 'Class is not assigned to you' });
  }
  const students = await prisma.student.findMany({ where: { classId: query.classId }, orderBy: { rollNo: 'asc' }, include: { user: { select: { name: true, avatarUrl: true } } } });
  const session = await prisma.attendanceSession.findUnique({
    where: { classId_subjectId_date_period: query },
    select: { id: true, state: true, submittedAt: true, pdfFileName: true, pdfGeneratedAt: true, reopenReason: true, records: true },
  });
  res.json({ students, session });
}));

attendanceRouter.post('/submit', allow(Role.TEACHER), asyncRoute(async (req: any, res: any) => {
  const body = z.object({
    classId: z.string(), subjectId: z.string(), date: z.coerce.date(), period: z.number().int().min(1),
    records: z.array(z.object({ studentId: z.string(), status: z.nativeEnum(AttendanceStatus) })).min(1),
  }).parse(req.body);
  const teacher = await prisma.teacher.findUnique({ where: { userId: req.user.id }, include: { user: { select: { name: true } } } });
  const assigned = await prisma.teachingAssignment.findFirst({ where: { teacherId: teacher!.id, classId: body.classId, subjectId: body.subjectId }, include: { class: true, subject: true } });
  if (!assigned) return res.status(403).json({ message: 'Class is not assigned to you' });

  const students = await prisma.student.findMany({ where: { classId: body.classId }, orderBy: { rollNo: 'asc' }, include: { user: { select: { name: true } } } });
  const submittedIds = new Set(body.records.map((record) => record.studentId));
  if (submittedIds.size !== students.length || students.some((student) => !submittedIds.has(student.id))) return res.status(400).json({ message: 'Attendance is required for every student in this class' });
  const existing = await prisma.attendanceSession.findUnique({ where: { classId_subjectId_date_period: { classId: body.classId, subjectId: body.subjectId, date: body.date, period: body.period } } });
  if (existing?.state === AttendanceState.SUBMITTED) return res.status(409).json({ message: 'Register is locked; request admin approval to reopen it' });

  const statusByStudent = new Map(body.records.map((record) => [record.studentId, record.status]));
  const pdfData = await generateAttendancePdf({
    schoolClass: assigned.class.name,
    section: assigned.class.section,
    subject: assigned.subject.name,
    date: body.date,
    period: body.period,
    teacherName: teacher!.user.name,
    rows: students.map((student) => ({ rollNo: student.rollNo, admissionNo: student.admissionNo, name: student.user.name, status: statusByStudent.get(student.id)! })),
  });
  const storedPdf = Uint8Array.from(pdfData);
  const safeDate = body.date.toISOString().slice(0, 10);
  const pdfFileName = `attendance-${assigned.class.name}-${assigned.class.section}-${safeDate}-period-${body.period}.pdf`.replace(/[^a-zA-Z0-9._-]/g, '-');

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.upsert({
      where: { classId_subjectId_date_period: { classId: body.classId, subjectId: body.subjectId, date: body.date, period: body.period } },
      create: { classId: body.classId, subjectId: body.subjectId, date: body.date, period: body.period, markedById: teacher!.id, state: 'SUBMITTED', submittedAt: new Date(), pdfData: storedPdf, pdfFileName, pdfGeneratedAt: new Date() },
      update: { state: 'SUBMITTED', submittedAt: new Date(), markedById: teacher!.id, reopenReason: null, pdfData: storedPdf, pdfFileName, pdfGeneratedAt: new Date() },
    });
    await tx.attendanceRecord.deleteMany({ where: { sessionId: session.id } });
    await tx.attendanceRecord.createMany({ data: body.records.map((record) => ({ ...record, sessionId: session.id })) });
    return { id: session.id, state: session.state, submittedAt: session.submittedAt, pdfFileName: session.pdfFileName, pdfGeneratedAt: session.pdfGeneratedAt };
  });
  res.status(201).json(result);
}));

attendanceRouter.get('/session/:id/pdf', allow(Role.TEACHER, Role.ADMIN), asyncRoute(async (req: any, res: any) => {
  const session = await prisma.attendanceSession.findUnique({ where: { id: req.params.id }, select: { id: true, classId: true, markedById: true, pdfData: true, pdfFileName: true } });
  if (!session?.pdfData) return res.status(404).json({ message: 'Attendance PDF is not available' });
  if (req.user.role === Role.TEACHER) {
    const teacher = await prisma.teacher.findUnique({ where: { userId: req.user.id } });
    const assigned = await prisma.teachingAssignment.findFirst({ where: { teacherId: teacher!.id, classId: session.classId } });
    if (!assigned) return res.status(403).json({ message: 'This attendance PDF is not available to you' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', session.pdfData.length);
  res.setHeader('Content-Disposition', `attachment; filename="${(session.pdfFileName || 'attendance.pdf').replace(/["\\]/g, '_')}"`);
  res.send(Buffer.from(session.pdfData));
}));

attendanceRouter.post('/:id/request-reopen', allow(Role.TEACHER), asyncRoute(async (req: any, res: any) => {
  const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
  const session = await prisma.attendanceSession.update({ where: { id: req.params.id }, data: { state: 'REOPEN_REQUESTED', reopenReason: reason } });
  res.json(session);
}));

attendanceRouter.post('/:id/approve-reopen', allow(Role.ADMIN), asyncRoute(async (req: any, res: any) => {
  res.json(await prisma.attendanceSession.update({ where: { id: req.params.id }, data: { state: 'REOPENED' } }));
}));

attendanceRouter.get('/my-report', allow(Role.STUDENT), asyncRoute(async (req: any, res: any) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const records = await prisma.attendanceRecord.findMany({ where: { studentId: student!.id, session: { date: { gte: from }, state: 'SUBMITTED' } }, include: { session: { include: { subject: true } } }, orderBy: { session: { date: 'desc' } } });
  const present = records.filter((record) => record.status === 'PRESENT').length;
  res.json({ records, summary: { total: records.length, present, absent: records.filter((record) => record.status === 'ABSENT').length, leave: records.filter((record) => record.status === 'LEAVE').length, percentage: records.length ? Math.round(present / records.length * 1000) / 10 : 0 } });
}));

attendanceRouter.get('/reports', allow(Role.ADMIN), asyncRoute(async (req: any, res: any) => {
  const classId = req.query.classId ? String(req.query.classId) : undefined;
  const rows = await prisma.student.findMany({ where: { classId }, include: { user: { select: { name: true } }, class: true, attendance: { where: { session: { state: 'SUBMITTED' } } } } });
  res.json(rows.map((student) => {
    const present = student.attendance.filter((attendance) => attendance.status === 'PRESENT').length;
    return { studentId: student.id, name: student.user.name, rollNo: student.rollNo, class: `${student.class.name} ${student.class.section}`, total: student.attendance.length, present, percentage: student.attendance.length ? Math.round(present / student.attendance.length * 1000) / 10 : 0 };
  }));
}));
