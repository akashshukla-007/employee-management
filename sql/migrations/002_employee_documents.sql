-- Migration 002: multi-file document storage for Joining Forms and F11 forms.
-- Purely additive -- creates one new table, does not touch public.employees
-- or any existing data. Safe to run on any existing database.

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id text not null references public.employees(employee_id) on delete cascade,
  category text not null check (category in ('joining_form', 'f11')),
  file_path text not null,
  file_name text,
  mime_type text,
  file_size bigint,
  uploaded_at timestamptz not null default now()
);

create index if not exists employee_documents_employee_idx on public.employee_documents(employee_id);
create index if not exists employee_documents_category_idx on public.employee_documents(category);

alter table public.employee_documents enable row level security;
-- No public policies: all access goes through the server using the
-- service_role key, same pattern as public.employees.
