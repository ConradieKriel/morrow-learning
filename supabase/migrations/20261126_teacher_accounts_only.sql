-- Morrow now has teacher accounts only. Learners use the direct public share link.
-- Run this once in Supabase SQL Editor after 20261112_security_hardening.sql.

-- Remove the old student test accounts. Learners now use only public activity
-- links, and a former student login must not be promoted into a teacher account.
-- Deleting the Auth users cascades to their profiles and any activities/versions
-- owned by those profiles. The former student role had no activity-write access.
alter table public.profiles drop constraint if exists profiles_role_check;
delete from auth.users as old_user
using public.profiles as old_profile
where old_profile.id = old_user.id
  and old_profile.role = 'student';
alter table public.profiles alter column role set default 'teacher';
alter table public.profiles add constraint profiles_role_check check (role = 'teacher');

-- Remove the student-only activity listing policy. Public links remain available
-- through the strict share-slug policy created by the security hardening migration.
drop policy if exists "Students read published activities for their grade" on public.activities;

-- Create a trusted profile automatically for every new Supabase Auth account.
-- The browser does not receive INSERT or UPDATE permission on public.profiles.
create or replace function public.handle_new_teacher_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, email, role, grade, display_name)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@unknown.invalid'),
    'teacher',
    null,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Teacher')
  )
  on conflict (id) do update
    set email = excluded.email, role = 'teacher', grade = null;
  return new;
end;
$function$;

revoke all on function public.handle_new_teacher_profile() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_teacher_profile on auth.users;
create trigger on_auth_user_created_teacher_profile
after insert on auth.users
for each row execute function public.handle_new_teacher_profile();
