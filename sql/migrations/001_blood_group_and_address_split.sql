-- Migration 001: Blood Group + structured Present/Permanent address fields.
-- Safe to run on an existing production database:
--   * Only ADDS columns (no drops, no renames) -- existing employee_management
--     rows and the legacy present_address / permanent_address text columns
--     are left completely intact.
--   * Backfills the new *_address_line columns from the legacy free-text
--     columns for existing employees, so no address data is lost. City,
--     State and PIN Code are left blank for pre-existing rows since the old
--     data was a single free-text field and can't be reliably split
--     automatically -- an admin can fill those in from the Edit form.
-- Run this in the Supabase SQL Editor for any database created before this
-- migration existed. Fresh installs get these columns directly from
-- sql/schema.sql and do not need to run this file.

alter table public.employees
  add column if not exists blood_group text,
  add column if not exists present_address_line text,
  add column if not exists present_city text,
  add column if not exists present_state text,
  add column if not exists present_pincode text,
  add column if not exists permanent_address_line text,
  add column if not exists permanent_city text,
  add column if not exists permanent_state text,
  add column if not exists permanent_pincode text;

-- Backfill: copy the legacy single-field address into the new "line" field
-- only where the new field is still empty, so re-running this migration is
-- safe and never overwrites data an admin has already entered.
update public.employees
set present_address_line = present_address
where present_address_line is null and present_address is not null;

update public.employees
set permanent_address_line = permanent_address
where permanent_address_line is null and permanent_address is not null;
