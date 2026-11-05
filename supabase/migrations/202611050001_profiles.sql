-- Run once in your own Supabase project's SQL Editor.
-- Application data is always owned by the authenticated Supabase user.
create table public.sushi_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 6000000),
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now()
);
alter table public.sushi_profiles enable row level security;
revoke all on public.sushi_profiles from anon;
grant select, insert, update on public.sushi_profiles to authenticated;
create policy "read own study profile" on public.sushi_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own study profile" on public.sushi_profiles for insert to authenticated with check ((select auth.uid()) = user_id and revision = 1);
create policy "update own study profile" on public.sushi_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.sushi_profile_timestamp() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger sushi_profile_updated before update on public.sushi_profiles for each row execute function public.sushi_profile_timestamp();
