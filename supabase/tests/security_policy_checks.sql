-- Run with `supabase test db` after applying the current schema/migrations.
-- These pgTAP checks verify the expected grants, policies and function privileges.
begin;
select plan(24);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled on profiles'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.activities'::regclass),
  'RLS is enabled on activities'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.activity_versions'::regclass),
  'RLS is enabled on activity_versions'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.api_rate_limits'::regclass),
  'RLS is enabled on api_rate_limits'
);

select ok(not has_table_privilege('anon', 'public.activities', 'SELECT'), 'anon has no table-wide SELECT privilege');
select ok(has_column_privilege('anon', 'public.activities', 'html', 'SELECT'), 'anon can read the HTML column for a permitted public share');
select ok(not has_column_privilege('anon', 'public.activities', 'teacher_id', 'SELECT'), 'anon cannot read the owner identity column');
select ok(not has_table_privilege('anon', 'public.activities', 'INSERT'), 'anon cannot insert activities');
select ok(not has_table_privilege('anon', 'public.activities', 'UPDATE'), 'anon cannot update activities');
select ok(not has_table_privilege('anon', 'public.activities', 'DELETE'), 'anon cannot delete activities');
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anon cannot read profiles');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated users cannot edit profile roles or grades');
select ok(not has_table_privilege('anon', 'public.api_rate_limits', 'SELECT'), 'anon cannot read API rate-limit counters');


select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'activities'),
  5,
  'activities has exactly five teacher and public-share policies'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'profiles'),
  1,
  'profiles has exactly one owner-only read policy'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'activity_versions'),
  2,
  'activity_versions has exactly two teacher-owner policies'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'api_rate_limits'),
  3,
  'api_rate_limits has exactly three self-only policies'
);

select ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activities' and policyname ilike '%student%'),
  'there are no student-only activity policies'
);
select ok(
  exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check' and pg_get_constraintdef(oid) ilike '%teacher%'),
  'profiles role constraint only allows teachers'
);
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created_teacher_profile' and not tgisinternal),
  'new Auth accounts receive teacher profiles automatically'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activities' and policyname = 'Public share link reads exact activity' and qual ilike '%x-morrow-share-slug%'),
  'anonymous activity policy requires the exact share slug header'
);
select ok(
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'get_public_activity'),
  'legacy public get_public_activity RPC has been removed'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.consume_rate_limit(text,integer)'::regprocedure),
  'consume_rate_limit runs as SECURITY INVOKER'
);
select ok(
  not (select prosecdef from pg_proc where oid = 'public.protect_api_rate_limit()'::regprocedure),
  'protect_api_rate_limit runs as SECURITY INVOKER'
);

select * from finish();
rollback;
