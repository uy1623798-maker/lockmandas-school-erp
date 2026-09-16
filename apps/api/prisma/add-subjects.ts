import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const subjects = [
  ['ENG', 'English'], ['HIN', 'Hindi'], ['MATH', 'Mathematics'],
  ['EVS', 'Environmental Studies'], ['SCI', 'Science'], ['SST', 'Social Science'],
  ['SAN', 'Sanskrit'], ['COMP', 'Computer Science'], ['GK', 'General Knowledge'],
  ['PE', 'Physical Education'], ['ART', 'Art & Craft'], ['MUS', 'Music'],
  ['MORAL', 'Moral Education'], ['CLASS-ATT', 'Class Attendance'],
] as const;

async function main() {
  for (const [code, name] of subjects) {
    await prisma.subject.upsert({ where: { code }, update: { name }, create: { code, name } });
  }
  const saved = await prisma.subject.findMany({ orderBy: { name: 'asc' }, select: { code: true, name: true } });
  console.log(JSON.stringify(saved));
}

main().finally(() => prisma.$disconnect());
