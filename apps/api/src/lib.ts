import { PrismaClient, Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from './config.js';
export const prisma = new PrismaClient();
export type SessionUser = { id: string; role: Role };
declare global { namespace Express { interface Request { user?: SessionUser } } }
export const signAccess = (u: SessionUser) => jwt.sign(u, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
export const signRefresh = (u: SessionUser) => jwt.sign(u, env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
export function auth(req: Request, res: Response, next: NextFunction) { try { const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) throw Error(); req.user = jwt.verify(token, env.JWT_ACCESS_SECRET) as SessionUser; next(); } catch { res.status(401).json({ message: 'Authentication required' }); } }
export const allow = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => roles.includes(req.user!.role) ? next() : res.status(403).json({ message: 'Insufficient permission' });
export const asyncRoute = (fn: Function) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
