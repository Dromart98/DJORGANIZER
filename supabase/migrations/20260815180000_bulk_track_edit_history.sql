alter table public.track_edit_history
  add column batch_id uuid;

alter table public.track_edit_history
  drop constraint if exists track_edit_history_change_kind_check;

alter table public.track_edit_history
  add constraint track_edit_history_change_kind_check
  check (change_kind in ('individual_edit', 'bulk_edit'));

create index track_edit_history_user_batch_created_idx
  on public.track_edit_history (user_id, batch_id, created_at desc)
  where batch_id is not null;

create or replace function public.bulk_update_tracks_with_history(
  requested_track_ids uuid[],
  requested_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  requested_count integer;
  owned_count integer;
  before_track public.tracks%rowtype;
  after_track public.tracks%rowtype;
  before_snapshot jsonb;
  after_snapshot jsonb;
  changed_fields text[];
  new_batch_id uuid := gen_random_uuid();
  changed_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  requested_count := coalesce(cardinality(requested_track_ids), 0);
  if requested_count < 1 or requested_count > 100
     or requested_patch is null
     or jsonb_typeof(requested_patch) <> 'object'
     or requested_patch = '{}'::jsonb then
    raise exception 'Invalid bulk track edit';
  end if;

  if exists (select 1 from unnest(requested_track_ids) as ids(id) where ids.id is null)
     or (select count(distinct ids.id) from unnest(requested_track_ids) as ids(id)) <> requested_count then
    raise exception 'Invalid bulk track selection';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(requested_patch) as patch_key(key)
    where patch_key.key not in (
      'album',
      'bpm', 'bpm_confidence', 'bpm_explanation', 'bpm_source',
      'camelot_key', 'comments',
      'energy', 'energy_confidence', 'energy_source',
      'genre', 'genre_analyzed_at_ms', 'genre_analyzer_id',
      'genre_analyzer_version', 'genre_compatibility_key', 'genre_confidence',
      'genre_raw_score', 'genre_source',
      'key_confidence', 'key_explanation', 'key_source', 'musical_key',
      'rating', 'release_year',
      'subgenre', 'subgenre_analyzed_at_ms', 'subgenre_analyzer_id',
      'subgenre_analyzer_version', 'subgenre_compatibility_key',
      'subgenre_confidence', 'subgenre_raw_score', 'subgenre_source'
    )
  ) then
    raise exception 'Invalid bulk track edit fields';
  end if;

  perform 1
  from public.tracks t
  where t.user_id = current_user_id
    and t.id = any(requested_track_ids)
  order by t.id
  for update;

  select count(*)::integer
  into owned_count
  from public.tracks t
  where t.user_id = current_user_id
    and t.id = any(requested_track_ids);

  if owned_count <> requested_count then
    raise exception 'Bulk track selection changed';
  end if;

  for before_track in
    select t.*
    from public.tracks t
    where t.user_id = current_user_id
      and t.id = any(requested_track_ids)
    order by t.id
  loop
    select populated.*
    into after_track
    from jsonb_populate_record(before_track, requested_patch) as populated;

    before_snapshot := private.track_edit_snapshot(before_track);
    after_snapshot := private.track_edit_snapshot(after_track);

    if before_snapshot = after_snapshot then
      continue;
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
    where t.id = before_track.id
      and t.user_id = current_user_id;

    insert into public.track_edit_history (
      user_id,
      track_id,
      change_kind,
      batch_id,
      before_state,
      after_state,
      changed_fields
    )
    values (
      current_user_id,
      before_track.id,
      'bulk_edit',
      new_batch_id,
      before_snapshot,
      after_snapshot,
      changed_fields
    );

    changed_count := changed_count + 1;
  end loop;

  return jsonb_build_object(
    'batch_id', case when changed_count > 0 then new_batch_id else null end,
    'changed_count', changed_count,
    'requested_count', requested_count
  );
end;
$$;

revoke all on function public.bulk_update_tracks_with_history(uuid[], jsonb)
  from public, anon;
grant execute on function public.bulk_update_tracks_with_history(uuid[], jsonb)
  to authenticated;

create or replace function public.undo_bulk_track_edit(requested_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  history_count integer;
  track_count integer;
  history_row public.track_edit_history%rowtype;
  current_track public.tracks%rowtype;
  restored_track public.tracks%rowtype;
  current_snapshot jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if requested_batch_id is null then
    raise exception 'Invalid bulk history batch';
  end if;

  perform 1
  from public.track_edit_history h
  where h.user_id = current_user_id
    and h.batch_id = requested_batch_id
    and h.change_kind = 'bulk_edit'
  order by h.track_id
  for update;

  select count(*)::integer
  into history_count
  from public.track_edit_history h
  where h.user_id = current_user_id
    and h.batch_id = requested_batch_id
    and h.change_kind = 'bulk_edit';

  if history_count = 0 then
    raise exception 'Bulk history batch not found';
  end if;

  if exists (
    select 1
    from public.track_edit_history h
    where h.user_id = current_user_id
      and h.batch_id = requested_batch_id
      and h.change_kind = 'bulk_edit'
      and h.undone_at is not null
  ) then
    raise exception 'Bulk history batch already undone';
  end if;

  perform 1
  from public.tracks t
  join public.track_edit_history h
    on h.track_id = t.id
   and h.user_id = t.user_id
  where h.user_id = current_user_id
    and h.batch_id = requested_batch_id
    and h.change_kind = 'bulk_edit'
  order by t.id
  for update of t;

  select count(*)::integer
  into track_count
  from public.tracks t
  join public.track_edit_history h
    on h.track_id = t.id
   and h.user_id = t.user_id
  where h.user_id = current_user_id
    and h.batch_id = requested_batch_id
    and h.change_kind = 'bulk_edit';

  if track_count <> history_count then
    raise exception 'Bulk track selection changed after history entry';
  end if;

  for history_row in
    select h.*
    from public.track_edit_history h
    where h.user_id = current_user_id
      and h.batch_id = requested_batch_id
      and h.change_kind = 'bulk_edit'
    order by h.track_id
  loop
    select t.*
    into current_track
    from public.tracks t
    where t.id = history_row.track_id
      and t.user_id = current_user_id;

    current_snapshot := private.track_edit_snapshot(current_track);
    if current_snapshot is distinct from history_row.after_state then
      raise exception 'Bulk track changed after history entry';
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
  end loop;

  update public.track_edit_history h
  set undone_at = clock_timestamp()
  where h.user_id = current_user_id
    and h.batch_id = requested_batch_id
    and h.change_kind = 'bulk_edit';

  return jsonb_build_object(
    'batch_id', requested_batch_id,
    'restored_count', history_count
  );
end;
$$;

revoke all on function public.undo_bulk_track_edit(uuid) from public, anon;
grant execute on function public.undo_bulk_track_edit(uuid) to authenticated;

create or replace function public.list_bulk_track_edit_batches(
  requested_limit integer default 10
)
returns table (
  batch_id uuid,
  track_count bigint,
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
  safe_limit integer := greatest(1, least(coalesce(requested_limit, 10), 50));
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    h.batch_id,
    count(*) as track_count,
    min(h.created_at) as created_at,
    max(h.undone_at) as undone_at,
    bool_and(
      h.undone_at is null
      and private.track_edit_snapshot(t) = h.after_state
    ) as can_undo
  from public.track_edit_history h
  join public.tracks t
    on t.id = h.track_id
   and t.user_id = h.user_id
  where h.user_id = current_user_id
    and h.change_kind = 'bulk_edit'
    and h.batch_id is not null
  group by h.batch_id
  order by
    bool_and(
      h.undone_at is null
      and private.track_edit_snapshot(t) = h.after_state
    ) desc,
    min(h.created_at) desc,
    h.batch_id desc
  limit safe_limit;
end;
$$;

revoke all on function public.list_bulk_track_edit_batches(integer)
  from public, anon;
grant execute on function public.list_bulk_track_edit_batches(integer)
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
    and h.change_kind = 'individual_edit'
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
    and h.change_kind = 'individual_edit'
  order by
    (h.undone_at is null and h.after_state = current_snapshot) desc,
    h.created_at desc,
    h.id desc
  limit safe_limit;
end;
$$;
