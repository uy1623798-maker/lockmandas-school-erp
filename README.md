# Dr. Lokmandas Public School ERP

A full-stack school website and role-based ERP built with React, Express, Prisma, PostgreSQL, JWT, and bcrypt.

## Quick start

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL: `docker compose up -d`.
3. Install packages: `npm install`.
4. Create the schema: `npm run db:push`.
5. Load demo data: `npm run db:seed`.
6. Start both apps: `npm run dev`.

Open `http://localhost:5173`. Demo usernames are `admin`, `teacher`, and `student1`; all use `School@123`.

## Architecture

- `apps/web`: responsive public website and Admin/Teacher/Student portal.
- `apps/api`: Express API, authentication, role guards, attendance, academics, notices, marks, and public forms.
- `apps/api/prisma/schema.prisma`: normalized PostgreSQL schema.

Attendance is stored as an immutable submitted session per class, subject, date, and period. A teacher can request a reopen; an admin must approve it before a corrected register can be submitted.

## Main API routes

- `POST /api/auth/login`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password`
- `GET /api/attendance/teacher/classes`, `/register`, `/my-report`, `/reports`
- `POST /api/attendance/submit`, `/:id/request-reopen`, `/:id/approve-reopen`
- CRUD under `/api/admin`: `subjects`, `classes`, `academicYears`, `timetable`, `assignments`
- `GET/POST /api/portal/marks`, `/notices`; `GET /dashboard`, `/timetable`
- `POST /api/public/admission`, `/contact`

For production, connect an email provider in the forgot-password handler, serve behind HTTPS, set secure secrets, add rate limiting, and use managed PostgreSQL backups.

## Deploy on Render

The root `render.yaml` is a complete Blueprint for one Node web service and one PostgreSQL database. In Render, choose **New → Blueprint**, connect this repository, and deploy. Render generates both JWT secrets, creates the database schema, seeds demo accounts once, and serves the built React application from Express.
