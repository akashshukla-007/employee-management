# Employee Management System

A Vercel-ready employee database application built with **HTML + CSS + Vanilla JavaScript + Node.js serverless APIs + Supabase + ExcelJS**.

The supplied workbook is included in `template/` for reference. Its employee columns C:AJ are the source of truth.

## Features

- Admin password login
- Employee CRUD
- Search/filter
- Automatic age calculation
- Photo + specimen signature upload
- Private Supabase Storage
- Supabase PostgreSQL database
- Automatic SR number
- Excel export matching the supplied employee column order
- Photos/signatures embedded in exported Excel when available
- Excel import for employee text/date fields
- Responsive dashboard
- Vercel serverless deployment

## Important demo login

Set this Vercel environment variable:

`ADMIN_PASSWORD=Admin@123`

Change it before any real use.

## Supabase setup

1. Create a free Supabase project.
2. Open **SQL Editor**.
3. Run all SQL from `sql/schema.sql`.
4. Open **Project Settings → API**.
5. Copy the **Project URL** and the **service_role secret key**.
6. Do not put the service_role key in frontend JavaScript.
7. In Vercel add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_BUCKET=employee-files`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
8. Redeploy.

## Local run

```bash
npm install
npx vercel dev
```

Open the URL shown by Vercel CLI. Do not double-click `public/index.html`, because the `/api/*` serverless routes need to run through Vercel.

## Deploy to Vercel

```bash
npm install
npx vercel login
npx vercel
```

For production:

```bash
npx vercel --prod
```

Or import the GitHub repository from the Vercel dashboard. The project has no React build step; Vercel serves `public/index.html` and runs `api/*.js` as Node.js functions.

## Excel import note

The import button reads the employee data columns from the supplied workbook. Existing embedded images in an Excel workbook are not automatically extracted by the browser-side importer; for the cleanest migration, import employee rows first and upload photos/signatures through the employee form. The export path fully supports embedding images already stored in Supabase.

## Security note

This is designed as a demo/small internal system. For production HR data, add stronger authentication (Supabase Auth/SSO), audit logs, role-based access, stricter validation and appropriate data-retention/privacy controls.
