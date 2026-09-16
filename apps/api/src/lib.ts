import { PrismaClient, Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { env } from './config.js';
export const prisma = new PrismaClient();
export type SessionUser = { id: string; role: Role };
declare global { namespace Express { interface Request { user?: SessionUser } } }
const jwtIdentity = { issuer: 'lokmandas-erp', audience: 'lokmandas-web' };
export const signAccess = (u: SessionUser) => jwt.sign(u, env.JWT_ACCESS_SECRET, { ...jwtIdentity, algorithm: 'HS256', expiresIn: '15m' });
export const signRefresh = (u: SessionUser) => jwt.sign(u, env.JWT_REFRESH_SECRET, { ...jwtIdentity, algorithm: 'HS256', expiresIn: '7d' });
export function auth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw Error();
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET, { ...jwtIdentity, algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.id !== 'string' || !Object.values(Role).includes(payload.role as Role)) throw Error();
    req.user = { id: payload.id, role: payload.role as Role };
    next();
  } catch { res.status(401).json({ message: 'Authentication required' }); }
}
export const allow = (...roles: Role[]) => (req: Request, res: Response, next: NextFunction) => req.user && roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'Insufficient permission' });
export const asyncRoute = (fn: Function) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
