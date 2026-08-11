import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('School@123', 12);
  const year = await prisma.academicYear.upsert({
    where: { name: '2026-27' },
    update: { active: true },
    create: { name: '2026-27', startsOn: new Date('2026-04-01'), endsOn: new Date('2027-03-31'), active: true },
  });
  const classEight = await prisma.class.upsert({
    where: { name_section_academicYearId: { name: 'Class 8', section: 'A', academicYearId: year.id } },
    update: {},
    create: { name: 'Class 8', section: 'A', academicYearId: year.id },
  });
  const subjectCatalogue = [
    ['ENG', 'English'],
    ['HIN', 'Hindi'],
    ['MATH', 'Mathematics'],
    ['EVS', 'Environmental Studies'],
    ['SCI', 'Science'],
    ['SST', 'Social Science'],
    ['SAN', 'Sanskrit'],
    ['COMP', 'Computer Science'],
    ['GK', 'General Knowledge'],
    ['PE', 'Physical Education'],
    ['ART', 'Art & Craft'],
    ['MUS', 'Music'],
    ['MORAL', 'Moral Education'],
    ['CLASS-ATT', 'Class Attendance'],
  ] as const;
  const subjects = await Promise.all(subjectCatalogue.map(([code, name]) => prisma.subject.upsert({
    where: { code },
    update: { name },
    create: { name, code },
  })));
  const generalSubject = subjects.find(subject => subject.code === 'CLASS-ATT')!;
  const admin = await prisma.user.upsert({
    where: { username: 'admin' }, update: { email: 'admin@lokmandas.edu' },
    create: { name: 'School Administrator', username: 'admin', email: 'admin@lokmandas.edu', passwordHash, role: 'ADMIN' },
  });
  const teacherUser = await prisma.user.upsert({
    where: { username: 'teacher' }, update: { email: 'teacher@lokmandas.edu' },
    create: { name: 'Anita Sharma', username: 'teacher', email: 'teacher@lokmandas.edu', passwordHash, role: 'TEACHER' },
  });
  const teacher = await prisma.teacher.upsert({
    where: { userId: teacherUser.id }, update: {},
    create: { userId: teacherUser.id, employeeNo: 'T-1001', qualification: 'M.Sc., B.Ed.' },
  });

  const legacyMath = await prisma.subject.findUnique({ where: { code: 'MATH8' } });
  if (legacyMath) await prisma.teachingAssignment.deleteMany({ where: { teacherId: teacher.id, subjectId: legacyMath.id } });

  const currentClasses = await prisma.class.findMany({ where: { academicYearId: year.id }, select: { id: true } });
  for (const schoolClass of currentClasses) {
    await prisma.teachingAssignment.upsert({
      where: { teacherId_classId_subjectId: { teacherId: teacher.id, classId: schoolClass.id, subjectId: generalSubject.id } },
      update: {},
      create: { teacherId: teacher.id, classId: schoolClass.id, subjectId: generalSubject.id },
    });
  }

  if (await prisma.student.count({ where: { classId: classEight.id } }) === 0) {
    const names = ['Aarav Mehta', 'Diya Kapoor', 'Ishaan Verma', 'Meera Nair', 'Kabir Singh', 'Anaya Rao', 'Vivaan Joshi', 'Sara Khan'];
    for (let index = 1; index <= names.length; index += 1) {
      const user = await prisma.user.upsert({
        where: { username: `student${index}` }, update: { email: `student${index}@lokmandas.edu` },
        create: { name: names[index - 1], username: `student${index}`, email: `student${index}@lokmandas.edu`, passwordHash, role: 'STUDENT' },
      });
      await prisma.student.upsert({
        where: { userId: user.id }, update: {},
        create: { userId: user.id, admissionNo: `DLP-26-${String(index).padStart(3, '0')}`, classId: classEight.id, rollNo: index, parentContact: '9876543210' },
      });
    }
  }

  console.log({ admin: admin.email, teacherAssignments: currentClasses.length });
}

main().finally(() => prisma.$disconnect());
