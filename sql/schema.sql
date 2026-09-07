-- Run this entire script in Supabase SQL Editor.
-- It creates the employee table and the private storage bucket used by the app.

create extension if not exists pgcrypto;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  site_code text,
  pending_remark text,
  sr_no integer,
  employee_id text unique not null,
  employee_name text,
  surname text,
  gender text,
  father_spouse_name text,
  date_of_birth date,
  nationality text,
  education_level text,
  date_of_joining date,
  designation text,
  category text,
  type_of_employment text,
  mobile_no text,
  uan text,
  pan text,
  esic_ip text,
  lwf text,
  aadhaar text,
  bank_account_no text,
  bank_name text,
  ifsc_branch text,
  present_address text,
  permanent_address text,
  service_book_no text,
  date_of_exit date,
  reason_exit text,
  mark_for_identification text,
  photo_path text,
  signature_path text,
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employees_name_idx on public.employees using gin (to_tsvector('simple', coalesce(employee_name,'')));
create index if not exists employees_site_idx on public.employees(site_code);
create index if not exists employees_status_idx on public.employees(date_of_exit);

create or replace function public.set_employee_metadata()
returns trigger language plpgsql as $$
begin
  if new.sr_no is null then
    select coalesce(max(sr_no), 0) + 1 into new.sr_no from public.employees;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_employee_metadata on public.employees;
create trigger trg_employee_metadata
before insert or update on public.employees
for each row execute function public.set_employee_metadata();

-- Private bucket: the Node/Vercel API uses the Supabase service-role key server-side.
insert into storage.buckets (id, name, public)
values ('employee-files', 'employee-files', false)
on conflict (id) do nothing;

-- RLS is enabled. The public browser never receives the service-role key.
alter table public.employees enable row level security;

-- No public policies are required because all database operations are performed by the server using service_role.
