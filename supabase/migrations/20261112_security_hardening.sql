-- Morrow security hardening. Safe to run on an existing Morrow database.

-- Remove any older public SECURITY DEFINER share lookup RPC. Public access now
-- uses a server-added request header plus an ordinary RLS-filtered SELECT.
do $morrow$
declare v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_public_activity'
  loop
    execute format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_function);
    execute format('DROP FUNCTION %s', v_function);
  end loop;
end;
$morrow$;

-- Ensure RLS remains on even if a previous setup was changed manually.
alter table public.profiles enable row level security;
alter table public.activities enable row level security;
alter table public.activity_versions enable row level security;

-- Rebuild table policies from a known-good allowlist. Dropping every existing
-- policy prevents an older permissive policy from remaining active (Postgres
-- combines permissive policies with OR).
do $policies$
declare v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'activities', 'activity_versions')
  loop
    execute format('drop policy %I on %I.%I', v_policy.policyname, v_policy.schemaname, v_policy.tablename);
  end loop;
end;
$policies$;

-- Also clear any previous per-column grants. Table-level REVOKE alone does not
-- remove separately granted column privileges from an older configuration.
do $column_grants$
declare v_table text; v_column record;
begin
  foreach v_table in array array['profiles', 'activities', 'activity_versions'] loop
    for v_column in
      select attname from pg_attribute
      where attrelid = format('public.%I', v_table)::regclass
        and attnum > 0 and not attisdropped
    loop
      execute format('revoke all (%I) on table public.%I from public, anon, authenticated', v_column.attname, v_table);
    end loop;
  end loop;
end;
$column_grants$;

-- Profile roles and grades are managed by the project owner, never by a browser.
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
create policy "Profiles visible to their owner"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

-- Teachers can access their own activities and only teachers can mutate them.
revoke all on table public.activities from public, anon, authenticated;
grant select, insert, update, delete on table public.activities to authenticated;
create policy "Teachers read their own activities"
on public.activities for select to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher')
);
create policy "Students read published activities for their grade"
on public.activities for select to authenticated
using (
  is_published = true
  and public_slug is not null
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'student'
      and (public.activities.grade = p.grade or public.activities.grade = 'Any grade')
  )
);
create policy "Public share link reads exact activity"
on public.activities for select to anon
using (
  is_published = true
  and public_slug = (current_setting('request.headers', true)::jsonb ->> 'x-morrow-share-slug')
  and public_slug ~ '^(?:[A-Za-z0-9]{9}|[A-Za-z0-9]{16})$'
);
create policy "Teachers create their own activities"
on public.activities for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher')
);
create policy "Teachers update their own activities"
on public.activities for update to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher')
)
with check (
  teacher_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher')
);
create policy "Teachers delete their own activities"
on public.activities for delete to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher')
);
-- Anonymous column grants expose only the fields required by the public share page.
grant select (title, subject, grade, language, html, public_slug, is_published) on table public.activities to anon;

-- Version history is available only to the owning teacher, and is append-only
-- from the application's authenticated role.
revoke all on table public.activity_versions from public, anon, authenticated;
grant select, insert on table public.activity_versions to authenticated;
create policy "Teachers read their own versions"
on public.activity_versions for select to authenticated
using (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.activities a join public.profiles p on p.id = (select auth.uid())
    where a.id = activity_id and a.teacher_id = (select auth.uid()) and p.role = 'teacher'
  )
);
create policy "Teachers add versions to their own activities"
on public.activity_versions for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.activities a join public.profiles p on p.id = (select auth.uid())
    where a.id = activity_id and a.teacher_id = (select auth.uid()) and p.role = 'teacher'
  )
);

-- Atomic per-user API rate limits. Clients cannot read or modify this table directly.
create table if not exists public.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('gemini-generate', 'gemini-daily', 'activity-write', 'share-link')),
  window_started_at timestamptz not null default now(),
  hit_count integer not null default 0 check (hit_count >= 0),
  primary key (user_id, action)
);
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;
do $rate_column_grants$
declare v_column record;
begin
  for v_column in
    select attname from pg_attribute
    where attrelid = 'public.api_rate_limits'::regclass and attnum > 0 and not attisdropped
  loop
    execute format('revoke all (%I) on table public.api_rate_limits from public, anon, authenticated', v_column.attname);
  end loop;
end;
$rate_column_grants$;

-- A trigger owns the counter and window timestamps. Even if a user writes directly
-- to their own row through the Data API, they can only increment their counter, never reset it.
create or replace function public.protect_api_rate_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_window interval;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if tg_op = 'INSERT' then
    if new.user_id <> v_user_id then raise exception 'Cannot create another user rate-limit row'; end if;
    if new.action not in ('gemini-generate', 'gemini-daily', 'activity-write', 'share-link') then
      raise exception 'Invalid rate-limit action';
    end if;
    new.window_started_at := now();
    new.hit_count := 1;
  else
    if old.user_id <> v_user_id or new.user_id <> old.user_id or new.action <> old.action then
      raise exception 'Cannot change rate-limit ownership or action';
    end if;
    v_window := case old.action
      when 'gemini-generate' then interval '10 minutes'
      when 'gemini-daily' then interval '24 hours'
      when 'activity-write' then interval '10 minutes'
      when 'share-link' then interval '1 hour'
    end;
    if old.window_started_at + v_window <= now() then
      new.window_started_at := now();
      new.hit_count := 1;
    else
      new.window_started_at := old.window_started_at;
      new.hit_count := old.hit_count + 1;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists api_rate_limits_protect on public.api_rate_limits;
create trigger api_rate_limits_protect
before insert or update on public.api_rate_limits
for each row execute function public.protect_api_rate_limit();

do $rate_policies$
declare v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'api_rate_limits'
  loop
    execute format('drop policy %I on %I.%I', v_policy.policyname, v_policy.schemaname, v_policy.tablename);
  end loop;
end;
$rate_policies$;

create policy "Users read their own rate limit counters"
on public.api_rate_limits for select to authenticated
using (user_id = (select auth.uid()));
create policy "Users insert their own rate limit counters"
on public.api_rate_limits for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "Users update their own rate limit counters"
on public.api_rate_limits for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select (user_id, action, window_started_at, hit_count) on public.api_rate_limits to authenticated;
grant insert (user_id, action, window_started_at, hit_count) on public.api_rate_limits to authenticated;
grant update (hit_count) on public.api_rate_limits to authenticated;

create or replace function public.consume_rate_limit(p_action text, p_limit integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_hits integer;
begin
  if v_user_id is null or p_action not in ('gemini-generate', 'gemini-daily', 'activity-write', 'share-link')
     or p_limit < 1 or p_limit > 1000 then
    return false;
  end if;

  insert into public.api_rate_limits (user_id, action, window_started_at, hit_count)
  values (v_user_id, p_action, now(), 1)
  on conflict (user_id, action) do update
  set hit_count = public.api_rate_limits.hit_count + 1
  returning hit_count into v_hits;

  return v_hits <= p_limit;
end;
$function$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.protect_api_rate_limit() from public, anon, authenticated;
revoke all on function public.consume_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer) to authenticated;

-- Profiles remain read-only to the owner; role and grade changes must be made by the project owner.
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;

-- Version history remains accessible only to its owning teacher via existing RLS policies.
revoke all on table public.activity_versions from public, anon;
grant select, insert on table public.activity_versions to authenticated;
