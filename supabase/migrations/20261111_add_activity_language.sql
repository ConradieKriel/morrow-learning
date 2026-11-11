-- Save the output language selected by the teacher on the activity and each version.
-- Run once in Supabase Dashboard > SQL Editor for an existing Morrow database.

alter table public.activities
  add column if not exists language text not null default 'English';

alter table public.activity_versions
  add column if not exists language text not null default 'English';
