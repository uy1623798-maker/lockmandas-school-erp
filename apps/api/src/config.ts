import 'dotenv/config';
import { z } from 'zod';
export const env = z.object({
  DATABASE_URL: z.string(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  WEB_URL: z.string().default('http://localhost:5173'),
  PORT: z.coerce.number().default(4000),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  SCHOOL_ENQUIRY_EMAIL: z.string().email().default('drlokmandaspublicschool01@gmail.com'),
}).parse(process.env);
