create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  artist text not null check (char_length(artist) between 1 and 300),
  album text check (album is null or char_length(album) <= 300),
  genre text check (genre is null or char_length(genre) <= 120),
  bpm numeric(6, 2) check (bpm is null or bpm between 20 and 300),
  musical_key text check (musical_key is null or char_length(musical_key) <= 16),
  camelot_key text check (camelot_key is null or camelot_key ~ '^(?:[1-9]|1[0-2])[AB]$'),
  duration_seconds numeric(10, 3) check (duration_seconds is null or duration_seconds >= 0),
  release_year smallint check (release_year is null or release_year between 1000 and 2100),
  energy smallint check (energy is null or energy between 0 and 100),
  rating smallint check (rating is null or rating between 0 and 5),
  comments text check (comments is null or char_length(comments) <= 5000),
  file_name text check (file_name is null or char_length(file_name) <= 500),
  file_size bigint check (file_size is null or file_size >= 0),
  file_type text check (file_type is null or char_length(file_type) <= 120),
  file_fingerprint text check (file_fingerprint is null or char_length(file_fingerprint) <= 256),
  artwork_url text check (artwork_url is null or char_length(artwork_url) <= 2048),
  analysis_status text not null default 'not_analyzed'
    check (analysis_status in ('not_analyzed', 'pending', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.track_tags (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (track_id, tag_id),
  foreign key (track_id, user_id) references public.tracks (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

create table public.crates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.crate_tracks (
  user_id uuid not null references auth.users (id) on delete cascade,
  crate_id uuid not null,
  track_id uuid not null,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (crate_id, track_id),
  foreign key (crate_id, user_id) references public.crates (id, user_id) on delete cascade,
  foreign key (track_id, user_id) references public.tracks (id, user_id) on delete cascade
);

create index profiles_updated_at_idx on public.profiles (updated_at);
create index tracks_user_created_at_idx on public.tracks (user_id, created_at desc);
create index tracks_user_title_idx on public.tracks (user_id, title);
create index tracks_user_artist_idx on public.tracks (user_id, artist);
create unique index tracks_user_fingerprint_uidx
  on public.tracks (user_id, file_fingerprint)
  where file_fingerprint is not null;
create index tags_user_id_idx on public.tags (user_id);
create index track_tags_user_id_idx on public.track_tags (user_id);
create index track_tags_tag_id_user_id_idx on public.track_tags (tag_id, user_id);
create index crates_user_id_idx on public.crates (user_id);
create index crate_tracks_user_id_idx on public.crate_tracks (user_id);
create index crate_tracks_track_id_user_id_idx on public.crate_tracks (track_id, user_id);
create index crate_tracks_crate_position_idx on public.crate_tracks (crate_id, position);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger tracks_set_updated_at
before update on public.tracks
for each row execute function private.set_updated_at();

create trigger tags_set_updated_at
before update on public.tags
for each row execute function private.set_updated_at();

create trigger crates_set_updated_at
before update on public.crates
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80), '')
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated, service_role;
grant execute on function private.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.tags enable row level security;
alter table public.track_tags enable row level security;
alter table public.crates enable row level security;
alter table public.crate_tracks enable row level security;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);
create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);
create policy "profiles_update_own"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
create policy "profiles_delete_own"
on public.profiles for delete to authenticated
using ((select auth.uid()) = id);

create policy "tracks_select_own"
on public.tracks for select to authenticated
using ((select auth.uid()) = user_id);
create policy "tracks_insert_own"
on public.tracks for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "tracks_update_own"
on public.tracks for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "tracks_delete_own"
on public.tracks for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "tags_select_own"
on public.tags for select to authenticated
using ((select auth.uid()) = user_id);
create policy "tags_insert_own"
on public.tags for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "tags_update_own"
on public.tags for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "tags_delete_own"
on public.tags for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "track_tags_select_own"
on public.track_tags for select to authenticated
using ((select auth.uid()) = user_id);
create policy "track_tags_insert_own"
on public.track_tags for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "track_tags_update_own"
on public.track_tags for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "track_tags_delete_own"
on public.track_tags for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "crates_select_own"
on public.crates for select to authenticated
using ((select auth.uid()) = user_id);
create policy "crates_insert_own"
on public.crates for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "crates_update_own"
on public.crates for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "crates_delete_own"
on public.crates for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "crate_tracks_select_own"
on public.crate_tracks for select to authenticated
using ((select auth.uid()) = user_id);
create policy "crate_tracks_insert_own"
on public.crate_tracks for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "crate_tracks_update_own"
on public.crate_tracks for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "crate_tracks_delete_own"
on public.crate_tracks for delete to authenticated
using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.tracks,
  public.tags,
  public.track_tags,
  public.crates,
  public.crate_tracks
to authenticated;

revoke all on
  public.profiles,
  public.tracks,
  public.tags,
  public.track_tags,
  public.crates,
  public.crate_tracks
from anon;
