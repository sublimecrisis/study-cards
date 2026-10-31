-- Study Cards — cloud sync setup. Paste the whole file into Supabase → SQL Editor → Run.
-- Safe to run more than once.
--
-- One table holds every synced record (courses, sets, cards, reviews, quizzes,
-- settings, image entries) as JSON. Row-level security means each signed-in
-- user can only ever see or change their own rows.

create table if not exists public.records (
  user_id    uuid    not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text    not null check (kind in ('course','set','card','review','quiz','meta','image')),
  id         text    not null,
  updated_at bigint  not null,            -- client edit time (ms); newer edit wins
  deleted    boolean not null default false,
  data       jsonb   not null,
  server_ts  timestamptz not null default clock_timestamp(),  -- when the server got it; drives "what's new since"
  primary key (user_id, kind, id)
);

create index if not exists records_pull on public.records (user_id, server_ts);

alter table public.records enable row level security;

drop policy if exists "own rows" on public.records;
create policy "own rows" on public.records
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Upload a batch; a row is only replaced if the incoming edit is at least as new.
create or replace function public.push_records(items jsonb)
returns integer
language sql
security invoker
set search_path = public
as $$
  with rows as (
    select auth.uid() as user_id,
           r->>'kind' as kind,
           r->>'id' as id,
           (r->>'updated_at')::bigint as updated_at,
           coalesce((r->>'deleted')::boolean, false) as deleted,
           r->'data' as data
    from jsonb_array_elements(items) as r
  ), up as (
    insert into public.records as t (user_id, kind, id, updated_at, deleted, data, server_ts)
    select user_id, kind, id, updated_at, deleted, data, clock_timestamp() from rows
    on conflict (user_id, kind, id) do update
      set updated_at = excluded.updated_at,
          deleted    = excluded.deleted,
          data       = excluded.data,
          server_ts  = clock_timestamp()
      where excluded.updated_at >= t.updated_at
    returning 1
  )
  select count(*)::int from up;
$$;

grant execute on function public.push_records(jsonb) to authenticated;

-- Private storage for card images: each user gets a folder named after their user id.
insert into storage.buckets (id, name, public)
values ('images', 'images', false)
on conflict (id) do nothing;

drop policy if exists "own images read"   on storage.objects;
drop policy if exists "own images write"  on storage.objects;
drop policy if exists "own images update" on storage.objects;
drop policy if exists "own images delete" on storage.objects;

create policy "own images read" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own images write" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own images update" on storage.objects for update to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
