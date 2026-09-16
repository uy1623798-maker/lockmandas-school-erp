import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { asyncRoute, auth, prisma, SessionUser, signAccess, signRefresh } from '../lib.js';
import { env } from '../config.js';
export const authRouter = Router();
const crossSiteCookie=process.env.NODE_ENV==='production'&&Boolean(process.env.VERCEL);
const sameSite:'none'|'strict'=crossSiteCookie?'none':'strict';
const cookie = { httpOnly: true, sameSite, secure: process.env.NODE_ENV === 'production', path: '/api/auth', maxAge: 7 * 864e5 };
const clearCookie = { httpOnly: true, sameSite, secure: process.env.NODE_ENV === 'production', path: '/api/auth' };
const dummyPasswordHash = '$2b$12$LQv3c1yqBW9wOLzHzU5hKe7u8f/7Z8aPZ3QZ4pVfQhI9nQJ0m8i3S';
authRouter.post('/login', asyncRoute(async (req: any, res: any) => {
  const b = z.object({ login: z.string().trim().min(3), password: z.string().min(6) }).parse(req.body);
  let user = await prisma.user.findFirst({ where: { OR: [{ email: b.login.toLowerCase() }, { username: b.login }] } });
  if (!user) {
    const student = await prisma.student.findFirst({
      where: { admissionNo: { in: [...new Set([b.login, b.login.toUpperCase()])] } },
      include: { user: true },
    });
    user = student?.user ?? null;
  }
  if (!user) {
    const teacher = await prisma.teacher.findUnique({
      where: { employeeNo: b.login },
      include: { user: true },
    });
    user = teacher?.user ?? null;
  }
  const passwordMatches = await bcrypt.compare(b.password, user?.passwordHash || dummyPasswordHash);
  if (!user || !passwordMatches) return res.status(401).json({ message: 'Invalid credentials' });
  const payload = { id: user.id, role: user.role }; const refresh = signRefresh(payload);
  await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: await bcrypt.hash(refresh, 10) } });
  res.cookie('refreshToken', refresh, cookie).json({ accessToken: signAccess(payload), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));
authRouter.post('/refresh', asyncRoute(async (req: any, res: any) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).end();
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'], issuer: 'lokmandas-erp', audience: 'lokmandas-web' });
    if (typeof decoded === 'string' || typeof decoded.id !== 'string') throw Error();
    const payload = decoded as unknown as SessionUser;
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user?.refreshTokenHash || !(await bcrypt.compare(token, user.refreshTokenHash))) throw Error();
    const session = { id: user.id, role: user.role };
    const nextRefresh = signRefresh(session);
    await prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: await bcrypt.hash(nextRefresh, 10) } });
    res.cookie('refreshToken', nextRefresh, cookie).json({ accessToken: signAccess(session) });
  } catch {
    res.clearCookie('refreshToken', clearCookie).status(401).end();
  }
}));
authRouter.post('/logout', auth, asyncRoute(async (req: any, res: any) => { await prisma.user.update({ where: { id: req.user.id }, data: { refreshTokenHash: null } }); res.clearCookie('refreshToken', clearCookie).status(204).end(); }));
authRouter.get('/me', auth, asyncRoute(async (req: any, res: any) => { const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, name: true, username: true, email: true, role: true, avatarUrl: true, teacher: true, student: { include: { class: true } } } }); res.json(user); }));
authRouter.post('/forgot-password', asyncRoute(async (req: any, res: any) => { const { email } = z.object({ email: z.string().trim().email().max(254) }).parse(req.body); const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } }); if (user) { const resetToken = crypto.randomBytes(32).toString('hex'); await prisma.user.update({ where: { id: user.id }, data: { resetTokenHash: crypto.createHash('sha256').update(resetToken).digest('hex'), resetTokenExpires: new Date(Date.now() + 3600000) } }); } res.json({ message: 'If that account exists, reset instructions have been sent.' }); }));
authRouter.post('/reset-password', asyncRoute(async (req: any, res: any) => { const b = z.object({ token: z.string().length(64).regex(/^[a-f0-9]+$/), password: z.string().min(12).max(128) }).parse(req.body); const hash = crypto.createHash('sha256').update(b.token).digest('hex'); const user = await prisma.user.findFirst({ where: { resetTokenHash: hash, resetTokenExpires: { gt: new Date() } } }); if (!user) return res.status(400).json({ message: 'Invalid or expired reset link' }); await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(b.password, 12), resetTokenHash: null, resetTokenExpires: null, refreshTokenHash: null } }); res.clearCookie('refreshToken', clearCookie).status(204).end(); }));
