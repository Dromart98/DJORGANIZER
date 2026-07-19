alter table public.tracks
  add column acoustic_fingerprint text
    check (
      acoustic_fingerprint is null
      or char_length(acoustic_fingerprint) <= 5000
    ),
  add column genre_source text
    check (genre_source is null or genre_source in ('manual', 'metadata', 'openai')),
  add column genre_confidence numeric(4, 3)
    check (genre_confidence is null or genre_confidence between 0 and 1),
  add column version_type text
    check (
      version_type is null
      or version_type in ('edit', 'live', 'original', 'remaster', 'remix', 'unknown')
    );

alter table public.crates
  add column parent_id uuid,
  add constraint crates_parent_owner_fkey
    foreign key (parent_id, user_id)
    references public.crates (id, user_id)
    on delete set null (parent_id);

create index tracks_user_acoustic_fingerprint_idx
  on public.tracks (user_id)
  where acoustic_fingerprint is not null;
create index crates_parent_user_idx on public.crates (parent_id, user_id);

create table public.integration_syncs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null
    check (provider in ('virtualdj', 'rekordbox', 'serato', 'traktor')),
  list_name text not null check (char_length(list_name) between 1 and 120),
  direction text not null check (direction in ('export', 'import', 'reconcile')),
  track_ids uuid[] not null default '{}',
  conflict_count integer not null default 0 check (conflict_count >= 0),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create index integration_syncs_user_created_at_idx
  on public.integration_syncs (user_id, created_at desc);

alter table public.integration_syncs enable row level security;

create policy "integration_syncs_select_own"
on public.integration_syncs for select to authenticated
using ((select auth.uid()) = user_id);
create policy "integration_syncs_insert_own"
on public.integration_syncs for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "integration_syncs_delete_own"
on public.integration_syncs for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, delete on public.integration_syncs to authenticated;
revoke all on public.integration_syncs from anon;
