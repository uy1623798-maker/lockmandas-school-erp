import 'dotenv/config';
import { z } from 'zod';
export const env = z.object({ DATABASE_URL: z.string(), JWT_ACCESS_SECRET: z.string().min(16), JWT_REFRESH_SECRET: z.string().min(16), WEB_URL: z.string().default('http://localhost:5173'), PORT: z.coerce.number().default(4000) }).parse(process.env);
