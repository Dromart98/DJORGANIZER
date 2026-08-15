create table public.track_edit_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id uuid not null,
  change_kind text not null default 'individual_edit'
    check (change_kind in ('individual_edit')),
  before_state jsonb not null,
  after_state jsonb not null,
  changed_fields text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  foreign key (track_id, user_id)
    references public.tracks (id, user_id) on delete cascade
);

create index track_edit_history_user_track_created_idx
  on public.track_edit_history (user_id, track_id, created_at desc);

alter table public.track_edit_history enable row level security;
alter table public.track_edit_history force row level security;

create policy "track_edit_history_select_own"
on public.track_edit_history for select to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.track_edit_history from public, anon, authenticated;
grant select on public.track_edit_history to authenticated;

create or replace function private.track_edit_snapshot(track_row public.tracks)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'album', track_row.album,
    'artist', track_row.artist,
    'bpm', track_row.bpm,
    'bpm_confidence', track_row.bpm_confidence,
    'bpm_explanation', track_row.bpm_explanation,
    'bpm_source', track_row.bpm_source,
    'camelot_key', track_row.camelot_key,
    'comments', track_row.comments,
    'duration_seconds', track_row.duration_seconds,
    'energy', track_row.energy,
    'energy_confidence', track_row.energy_confidence,
    'energy_source', track_row.energy_source,
    'genre', track_row.genre,
    'genre_analyzed_at_ms', track_row.genre_analyzed_at_ms,
    'genre_analyzer_id', track_row.genre_analyzer_id,
    'genre_analyzer_version', track_row.genre_analyzer_version,
    'genre_compatibility_key', track_row.genre_compatibility_key,
    'genre_confidence', track_row.genre_confidence,
    'genre_raw_score', track_row.genre_raw_score,
    'genre_source', track_row.genre_source,
    'key_confidence', track_row.key_confidence,
    'key_explanation', track_row.key_explanation,
    'key_source', track_row.key_source,
    'musical_key', track_row.musical_key,
    'rating', track_row.rating,
    'release_year', track_row.release_year,
    'subgenre', track_row.subgenre,
    'subgenre_analyzed_at_ms', track_row.subgenre_analyzed_at_ms,
    'subgenre_analyzer_id', track_row.subgenre_analyzer_id,
    'subgenre_analyzer_version', track_row.subgenre_analyzer_version,
    'subgenre_compatibility_key', track_row.subgenre_compatibility_key,
    'subgenre_confidence', track_row.subgenre_confidence,
    'subgenre_raw_score', track_row.subgenre_raw_score,
    'subgenre_source', track_row.subgenre_source,
    'title', track_row.title
  );
$$;

revoke all on function private.track_edit_snapshot(public.tracks)
  from public, anon, authenticated, service_role;

create or replace function public.update_track_with_history(
  requested_track_id uuid,
  expected_updated_at timestamptz,
  requested_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  before_track public.tracks%rowtype;
  after_track public.tracks%rowtype;
  before_snapshot jsonb;
  after_snapshot jsonb;
  history_id uuid;
  changed_fields text[];
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if requested_track_id is null
     or expected_updated_at is null
     or requested_patch is null
     or jsonb_typeof(requested_patch) <> 'object' then
    raise exception 'Invalid track edit';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(requested_patch) as patch_key(key)
    where patch_key.key not in (
      'album', 'artist', 'bpm', 'bpm_confidence', 'bpm_explanation', 'bpm_source',
      'camelot_key', 'comments', 'duration_seconds', 'energy', 'energy_confidence',
      'energy_source', 'genre', 'genre_analyzed_at_ms', 'genre_analyzer_id',
      'genre_analyzer_version', 'genre_compatibility_key', 'genre_confidence',
      'genre_raw_score', 'genre_source', 'key_confidence', 'key_explanation',
      'key_source', 'musical_key', 'rating', 'release_year', 'subgenre',
      'subgenre_analyzed_at_ms', 'subgenre_analyzer_id', 'subgenre_analyzer_version',
      'subgenre_compatibility_key', 'subgenre_confidence', 'subgenre_raw_score',
      'subgenre_source', 'title'
    )
  ) then
    raise exception 'Invalid track edit fields';
  end if;

  select t.*
  into before_track
  from public.tracks t
  where t.id = requested_track_id
    and t.user_id = current_user_id
  for update;

  if not found then
    raise exception 'Track not found';
  end if;
  if before_track.updated_at is distinct from expected_updated_at then
    raise exception 'Track changed after form loaded';
  end if;

  select populated.*
  into after_track
  from jsonb_populate_record(before_track, requested_patch) as populated;

  before_snapshot := private.track_edit_snapshot(before_track);
  after_snapshot := private.track_edit_snapshot(after_track);

  if before_snapshot = after_snapshot then
    return jsonb_build_object(
      'changed', false,
      'history_id', null,
      'track_id', requested_track_id
    );
  end if;

  select coalesce(array_agg(field order by field), array[]::text[])
  into changed_fields
  from jsonb_object_keys(after_snapshot) as changed(field)
  where before_snapshot -> changed.field is distinct from after_snapshot -> changed.field;

  update public.tracks t
  set
    album = after_track.album,
    artist = after_track.artist,
    bpm = after_track.bpm,
    bpm_confidence = after_track.bpm_confidence,
    bpm_explanation = after_track.bpm_explanation,
    bpm_source = after_track.bpm_source,
    camelot_key = after_track.camelot_key,
    comments = after_track.comments,
    duration_seconds = after_track.duration_seconds,
    energy = after_track.energy,
    energy_confidence = after_track.energy_confidence,
    energy_source = after_track.energy_source,
    genre = after_track.genre,
    genre_analyzed_at_ms = after_track.genre_analyzed_at_ms,
    genre_analyzer_id = after_track.genre_analyzer_id,
    genre_analyzer_version = after_track.genre_analyzer_version,
    genre_compatibility_key = after_track.genre_compatibility_key,
    genre_confidence = after_track.genre_confidence,
    genre_raw_score = after_track.genre_raw_score,
    genre_source = after_track.genre_source,
    key_confidence = after_track.key_confidence,
    key_explanation = after_track.key_explanation,
    key_source = after_track.key_source,
    musical_key = after_track.musical_key,
    rating = after_track.rating,
    release_year = after_track.release_year,
    subgenre = after_track.subgenre,
    subgenre_analyzed_at_ms = after_track.subgenre_analyzed_at_ms,
    subgenre_analyzer_id = after_track.subgenre_analyzer_id,
    subgenre_analyzer_version = after_track.subgenre_analyzer_version,
    subgenre_compatibility_key = after_track.subgenre_compatibility_key,
    subgenre_confidence = after_track.subgenre_confidence,
    subgenre_raw_score = after_track.subgenre_raw_score,
    subgenre_source = after_track.subgenre_source,
    title = after_track.title
  where t.id = requested_track_id
    and t.user_id = current_user_id;

  insert into public.track_edit_history (
    user_id,
    track_id,
    before_state,
    after_state,
    changed_fields
  )
  values (
    current_user_id,
    requested_track_id,
    before_snapshot,
    after_snapshot,
    changed_fields
  )
  returning id into history_id;

  return jsonb_build_object(
    'changed', true,
    'history_id', history_id,
    'track_id', requested_track_id
  );
end;
$$;

revoke all on function public.update_track_with_history(uuid, timestamptz, jsonb)
  from public, anon;
grant execute on function public.update_track_with_history(uuid, timestamptz, jsonb)
  to authenticated;

create or replace function public.undo_track_edit(requested_history_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  history_row public.track_edit_history%rowtype;
  current_track public.tracks%rowtype;
  restored_track public.tracks%rowtype;
  current_snapshot jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if requested_history_id is null then
    raise exception 'Invalid history entry';
  end if;

  select h.*
  into history_row
  from public.track_edit_history h
  where h.id = requested_history_id
    and h.user_id = current_user_id
  for update;

  if not found then
    raise exception 'History entry not found';
  end if;
  if history_row.undone_at is not null then
    raise exception 'History entry already undone';
  end if;

  select t.*
  into current_track
  from public.tracks t
  where t.id = history_row.track_id
    and t.user_id = current_user_id
  for update;

  if not found then
    raise exception 'Track not found';
  end if;

  current_snapshot := private.track_edit_snapshot(current_track);
  if current_snapshot is distinct from history_row.after_state then
    raise exception 'Track changed after history entry';
  end if;

  select populated.*
  into restored_track
  from jsonb_populate_record(current_track, history_row.before_state) as populated;

  update public.tracks t
  set
    album = restored_track.album,
    artist = restored_track.artist,
    bpm = restored_track.bpm,
    bpm_confidence = restored_track.bpm_confidence,
    bpm_explanation = restored_track.bpm_explanation,
    bpm_source = restored_track.bpm_source,
    camelot_key = restored_track.camelot_key,
    comments = restored_track.comments,
    duration_seconds = restored_track.duration_seconds,
    energy = restored_track.energy,
    energy_confidence = restored_track.energy_confidence,
    energy_source = restored_track.energy_source,
    genre = restored_track.genre,
    genre_analyzed_at_ms = restored_track.genre_analyzed_at_ms,
    genre_analyzer_id = restored_track.genre_analyzer_id,
    genre_analyzer_version = restored_track.genre_analyzer_version,
    genre_compatibility_key = restored_track.genre_compatibility_key,
    genre_confidence = restored_track.genre_confidence,
    genre_raw_score = restored_track.genre_raw_score,
    genre_source = restored_track.genre_source,
    key_confidence = restored_track.key_confidence,
    key_explanation = restored_track.key_explanation,
    key_source = restored_track.key_source,
    musical_key = restored_track.musical_key,
    rating = restored_track.rating,
    release_year = restored_track.release_year,
    subgenre = restored_track.subgenre,
    subgenre_analyzed_at_ms = restored_track.subgenre_analyzed_at_ms,
    subgenre_analyzer_id = restored_track.subgenre_analyzer_id,
    subgenre_analyzer_version = restored_track.subgenre_analyzer_version,
    subgenre_compatibility_key = restored_track.subgenre_compatibility_key,
    subgenre_confidence = restored_track.subgenre_confidence,
    subgenre_raw_score = restored_track.subgenre_raw_score,
    subgenre_source = restored_track.subgenre_source,
    title = restored_track.title
  where t.id = history_row.track_id
    and t.user_id = current_user_id;

  update public.track_edit_history h
  set undone_at = clock_timestamp()
  where h.id = history_row.id;

  return jsonb_build_object(
    'history_id', history_row.id,
    'track_id', history_row.track_id
  );
end;
$$;

revoke all on function public.undo_track_edit(uuid) from public, anon;
grant execute on function public.undo_track_edit(uuid) to authenticated;

create or replace function public.list_track_edit_history(
  requested_track_id uuid,
  requested_limit integer default 20
)
returns table (
  id uuid,
  changed_fields text[],
  created_at timestamptz,
  undone_at timestamptz,
  can_undo boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_track public.tracks%rowtype;
  current_snapshot jsonb;
  safe_limit integer := greatest(1, least(coalesce(requested_limit, 20), 50));
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select t.*
  into current_track
  from public.tracks t
  where t.id = requested_track_id
    and t.user_id = current_user_id;

  if not found then
    raise exception 'Track not found';
  end if;

  current_snapshot := private.track_edit_snapshot(current_track);

  return query
  select
    h.id,
    h.changed_fields,
    h.created_at,
    h.undone_at,
    h.undone_at is null and h.after_state = current_snapshot as can_undo
  from public.track_edit_history h
  where h.user_id = current_user_id
    and h.track_id = requested_track_id
  order by h.created_at desc, h.id desc
  limit safe_limit;
end;
$$;

revoke all on function public.list_track_edit_history(uuid, integer)
  from public, anon;
grant execute on function public.list_track_edit_history(uuid, integer)
  to authenticated;
