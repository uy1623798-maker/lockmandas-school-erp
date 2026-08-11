import { Role } from '@prisma/client'; import { Router } from 'express'; import { z } from 'zod'; import { allow, asyncRoute, auth, prisma } from '../lib.js';
export const portalRouter=Router(); portalRouter.use(auth);
portalRouter.get('/dashboard',asyncRoute(async(q:any,r:any)=>{if(q.user.role==='ADMIN') return r.json({teachers:await prisma.teacher.count(),students:await prisma.student.count(),classes:await prisma.class.count(),pendingReopens:await prisma.attendanceSession.count({where:{state:'REOPEN_REQUESTED'}})}); if(q.user.role==='TEACHER'){const t=await prisma.teacher.findUnique({where:{userId:q.user.id}});return r.json({assignments:await prisma.teachingAssignment.findMany({where:{teacherId:t!.id},include:{class:true,subject:true}}),todaySessions:await prisma.attendanceSession.count({where:{markedById:t!.id,date:new Date()}})})} const s=await prisma.student.findUnique({where:{userId:q.user.id},include:{class:true}});return r.json({student:s})}));
portalRouter.get('/timetable',asyncRoute(async(q:any,r:any)=>{let where:any={};if(q.user.role==='TEACHER'){const t=await prisma.teacher.findUnique({where:{userId:q.user.id}});where.teacherId=t!.id}else if(q.user.role==='STUDENT'){const s=await prisma.student.findUnique({where:{userId:q.user.id}});where.classId=s!.classId}r.json(await prisma.timetableEntry.findMany({where,include:{class:true,subject:true,teacher:{include:{user:{select:{name:true}}}}},orderBy:[{dayOfWeek:'asc'},{period:'asc'}]}))}));
portalRouter.get('/marks',asyncRoute(async(q:any,r:any)=>{
  const student=q.user.role===Role.STUDENT?await prisma.student.findUnique({where:{userId:q.user.id}}):null;
  const teacher=q.user.role===Role.TEACHER?await prisma.teacher.findUnique({where:{userId:q.user.id}}):null;
  r.json(await prisma.mark.findMany({where:student?{studentId:student.id}:teacher?{teacherId:teacher.id}:{},include:{student:{include:{user:{select:{name:true}}}},subject:true},orderBy:[{exam:'asc'},{subject:{name:'asc'}}]}));
}));

portalRouter.get('/marks/teacher/assignments',allow(Role.TEACHER),asyncRoute(async(q:any,r:any)=>{
  const teacher=await prisma.teacher.findUnique({where:{userId:q.user.id}});
  r.json(await prisma.teachingAssignment.findMany({where:{teacherId:teacher!.id},include:{class:true,subject:true},orderBy:[{class:{name:'asc'}},{class:{section:'asc'}},{subject:{name:'asc'}}]}));
}));

portalRouter.get('/marks/register',allow(Role.TEACHER),asyncRoute(async(q:any,r:any)=>{
  const query=z.object({assignmentId:z.string(),exam:z.string().trim().min(1).max(80)}).parse(q.query);
  const teacher=await prisma.teacher.findUnique({where:{userId:q.user.id}});
  const assignment=await prisma.teachingAssignment.findFirst({where:{id:query.assignmentId,teacherId:teacher!.id},include:{class:true,subject:true}});
  if(!assignment)return r.status(403).json({message:'This class and subject are not assigned to you'});
  const students=await prisma.student.findMany({where:{classId:assignment.classId},include:{user:{select:{name:true}},marks:{where:{subjectId:assignment.subjectId,exam:query.exam},select:{score:true,maximum:true}}},orderBy:{rollNo:'asc'}});
  r.json({assignment,students:students.map(({marks,...student})=>({...student,mark:marks[0]||null}))});
}));

portalRouter.post('/marks/bulk',allow(Role.TEACHER),asyncRoute(async(q:any,r:any)=>{
  const body=z.object({assignmentId:z.string(),exam:z.string().trim().min(1).max(80),maximum:z.number().positive().max(1000),marks:z.array(z.object({studentId:z.string(),score:z.number().min(0)})).min(1)}).superRefine((value,ctx)=>{value.marks.forEach((mark,index)=>{if(mark.score>value.maximum)ctx.addIssue({code:z.ZodIssueCode.custom,path:['marks',index,'score'],message:'Score cannot exceed maximum marks'})})}).parse(q.body);
  const teacher=await prisma.teacher.findUnique({where:{userId:q.user.id}});
  const assignment=await prisma.teachingAssignment.findFirst({where:{id:body.assignmentId,teacherId:teacher!.id}});
  if(!assignment)return r.status(403).json({message:'This class and subject are not assigned to you'});
  const validStudents=await prisma.student.findMany({where:{classId:assignment.classId,id:{in:body.marks.map(x=>x.studentId)}},select:{id:true}});
  if(validStudents.length!==body.marks.length)return r.status(400).json({message:'One or more students do not belong to the selected class'});
  await prisma.$transaction(body.marks.map(mark=>prisma.mark.upsert({where:{studentId_subjectId_exam:{studentId:mark.studentId,subjectId:assignment.subjectId,exam:body.exam}},create:{studentId:mark.studentId,subjectId:assignment.subjectId,exam:body.exam,score:mark.score,maximum:body.maximum,teacherId:teacher!.id},update:{score:mark.score,maximum:body.maximum,teacherId:teacher!.id}})));
  r.status(201).json({message:'Marks saved successfully',count:body.marks.length});
}));
portalRouter.get('/notices',asyncRoute(async(q:any,r:any)=>{const s=q.user.role==='STUDENT'?await prisma.student.findUnique({where:{userId:q.user.id}}):null;r.json(await prisma.notice.findMany({where:s?{OR:[{audience:'ALL'},{classId:s.classId}]}:{},include:{author:{select:{name:true}}},orderBy:{createdAt:'desc'}}))}));
portalRouter.post('/notices',allow(Role.ADMIN,Role.TEACHER),asyncRoute(async(q:any,r:any)=>r.status(201).json(await prisma.notice.create({data:{...q.body,authorId:q.user.id}}))));

portalRouter.get('/tc/teacher/students',allow(Role.TEACHER),asyncRoute(async(q:any,r:any)=>{
  const teacher=await prisma.teacher.findUnique({where:{userId:q.user.id}});
  const assignments=await prisma.teachingAssignment.findMany({where:{teacherId:teacher!.id},select:{classId:true}});
  const classIds=[...new Set(assignments.map(x=>x.classId))];
  const classes=await prisma.class.findMany({where:{id:{in:classIds}},include:{students:{orderBy:{rollNo:'asc'},include:{user:{select:{name:true}},transferCertificate:{select:{id:true,fileName:true,fileSize:true,uploadedAt:true}}}}},orderBy:[{name:'asc'},{section:'asc'}]});
  r.json(classes);
}));

portalRouter.get('/tc/me',allow(Role.STUDENT),asyncRoute(async(q:any,r:any)=>{
  const student=await prisma.student.findUnique({where:{userId:q.user.id}});
  const certificate=await prisma.transferCertificate.findUnique({where:{studentId:student!.id},select:{id:true,fileName:true,fileSize:true,uploadedAt:true,updatedAt:true}});
  r.json(certificate);
}));

portalRouter.post('/tc',allow(Role.TEACHER),asyncRoute(async(q:any,r:any)=>{
  const body=z.object({studentId:z.string(),fileName:z.string().trim().min(1).max(180),data:z.string().min(8).max(7_000_000)}).parse(q.body);
  const teacher=await prisma.teacher.findUnique({where:{userId:q.user.id}});
  const student=await prisma.student.findUnique({where:{id:body.studentId}});
  if(!student)return r.status(404).json({message:'Student not found'});
  const assigned=await prisma.teachingAssignment.findFirst({where:{teacherId:teacher!.id,classId:student.classId}});
  if(!assigned)return r.status(403).json({message:'This student is not in your assigned classes'});
  const fileData=Buffer.from(body.data,'base64');
  if(fileData.length>5*1024*1024)return r.status(413).json({message:'PDF must be 5 MB or smaller'});
  if(fileData.subarray(0,5).toString()!=='%PDF-')return r.status(400).json({message:'Only a valid PDF file can be uploaded'});
  const fileName=(body.fileName.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,180)||'transfer-certificate.pdf').replace(/\.pdf$/i,'')+'.pdf';
  const certificate=await prisma.transferCertificate.upsert({where:{studentId:student.id},create:{studentId:student.id,fileName,mimeType:'application/pdf',fileData,fileSize:fileData.length,uploadedById:teacher!.id},update:{fileName,mimeType:'application/pdf',fileData,fileSize:fileData.length,uploadedById:teacher!.id,uploadedAt:new Date()},select:{id:true,fileName:true,fileSize:true,uploadedAt:true}});
  r.status(201).json(certificate);
}));

portalRouter.get('/tc/:id/download',asyncRoute(async(q:any,r:any)=>{
  const certificate=await prisma.transferCertificate.findUnique({where:{id:q.params.id},include:{student:true}});
  if(!certificate)return r.status(404).json({message:'Transfer certificate not found'});
  let permitted=q.user.role===Role.ADMIN;
  if(q.user.role===Role.STUDENT)permitted=certificate.student.userId===q.user.id;
  if(q.user.role===Role.TEACHER){const teacher=await prisma.teacher.findUnique({where:{userId:q.user.id}});permitted=!!await prisma.teachingAssignment.findFirst({where:{teacherId:teacher!.id,classId:certificate.student.classId}})}
  if(!permitted)return r.status(403).json({message:'This transfer certificate is not available to you'});
  r.setHeader('Content-Type','application/pdf');
  r.setHeader('Content-Length',certificate.fileSize);
  r.setHeader('Content-Disposition',`attachment; filename="${certificate.fileName.replace(/["\\]/g,'_')}"`);
  r.send(Buffer.from(certificate.fileData));
}));
