create table private.bulk_track_edit_batches (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expected_count integer not null check (expected_count > 0 and expected_count <= 100),
  field_name text not null,
  previous_values jsonb not null default '[]'::jsonb,
  previous_value_count integer not null default 0 check (previous_value_count >= 0),
  created_at timestamptz not null default now()
);

create index bulk_track_edit_batches_user_created_idx
  on private.bulk_track_edit_batches (user_id, created_at desc);

revoke all on private.bulk_track_edit_batches from public, anon, authenticated, service_role;

create or replace function private.record_bulk_track_edit_batch_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  logical_field text;
  previous_value jsonb;
  existing_values jsonb;
  existing_value_count integer;
  value_seen boolean;
begin
  if new.change_kind <> 'bulk_edit' or new.batch_id is null then
    return new;
  end if;

  logical_field := case
    when new.changed_fields && array['album']::text[] then 'album'
    when new.changed_fields && array[
      'genre', 'genre_analyzed_at_ms', 'genre_analyzer_id',
      'genre_analyzer_version', 'genre_compatibility_key', 'genre_confidence',
      'genre_raw_score', 'genre_source'
    ]::text[] then 'genre'
    when new.changed_fields && array[
      'subgenre', 'subgenre_analyzed_at_ms', 'subgenre_analyzer_id',
      'subgenre_analyzer_version', 'subgenre_compatibility_key',
      'subgenre_confidence', 'subgenre_raw_score', 'subgenre_source'
    ]::text[] then 'subgenre'
    when new.changed_fields && array[
      'bpm', 'bpm_confidence', 'bpm_explanation', 'bpm_source'
    ]::text[] then 'bpm'
    when new.changed_fields && array[
      'musical_key', 'camelot_key', 'key_confidence', 'key_explanation', 'key_source'
    ]::text[] then 'musical_key'
    when new.changed_fields && array[
      'energy', 'energy_confidence', 'energy_source'
    ]::text[] then 'energy'
    when new.changed_fields && array['rating']::text[] then 'rating'
    when new.changed_fields && array['release_year']::text[] then 'release_year'
    when new.changed_fields && array['comments']::text[] then 'comments'
    else 'multiple'
  end;

  previous_value := case logical_field
    when 'album' then new.before_state -> 'album'
    when 'genre' then new.before_state -> 'genre'
    when 'subgenre' then new.before_state -> 'subgenre'
    when 'bpm' then new.before_state -> 'bpm'
    when 'musical_key' then new.before_state -> 'musical_key'
    when 'energy' then new.before_state -> 'energy'
    when 'rating' then new.before_state -> 'rating'
    when 'release_year' then new.before_state -> 'release_year'
    when 'comments' then
      case
        when new.before_state -> 'comments' = 'null'::jsonb then 'null'::jsonb
        else to_jsonb(left(coalesce(new.before_state ->> 'comments', ''), 120))
      end
    else 'null'::jsonb
  end;

  select b.previous_values, b.previous_value_count
  into existing_values, existing_value_count
  from private.bulk_track_edit_batches b
  where b.id = new.batch_id
  for update;

  if not found then
    insert into private.bulk_track_edit_batches (
      id,
      user_id,
      expected_count,
      field_name,
      previous_values,
      previous_value_count,
      created_at
    )
    values (
      new.batch_id,
      new.user_id,
      1,
      logical_field,
      jsonb_build_array(previous_value),
      1,
      new.created_at
    );
    return new;
  end if;

  value_seen := existing_values @> jsonb_build_array(previous_value);

  update private.bulk_track_edit_batches b
  set
    expected_count = b.expected_count + 1,
    field_name = case
      when b.field_name = logical_field then b.field_name
      else 'multiple'
    end,
    previous_value_count = b.previous_value_count + case when value_seen then 0 else 1 end,
    previous_values = case
      when value_seen or jsonb_array_length(b.previous_values) >= 3 then b.previous_values
      else b.previous_values || jsonb_build_array(previous_value)
    end
  where b.id = new.batch_id;

  return new;
end;
$$;

revoke all on function private.record_bulk_track_edit_batch_member()
  from public, anon, authenticated, service_role;

drop trigger if exists record_bulk_track_edit_batch_member
  on public.track_edit_history;

create trigger record_bulk_track_edit_batch_member
after insert on public.track_edit_history
for each row
when (new.change_kind = 'bulk_edit' and new.batch_id is not null)
execute function private.record_bulk_track_edit_batch_member();

-- Backfill any rows created by the immediately preceding migration when applying
-- this branch from scratch. In production there are no bulk rows before this PR,
-- but keeping this deterministic makes reset/test environments safe.
insert into private.bulk_track_edit_batches (
  id,
  user_id,
  expected_count,
  field_name,
  previous_values,
  previous_value_count,
  created_at
)
select
  h.batch_id,
  h.user_id,
  count(*)::integer,
  'multiple',
  '[]'::jsonb,
  0,
  min(h.created_at)
from public.track_edit_history h
where h.change_kind = 'bulk_edit'
  and h.batch_id is not null
group by h.batch_id, h.user_id
on conflict (id) do nothing;

create or replace function public.undo_bulk_track_edit(requested_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  expected_count integer;
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

  select b.expected_count
  into expected_count
  from private.bulk_track_edit_batches b
  where b.id = requested_batch_id
    and b.user_id = current_user_id
  for update;

  if not found then
    raise exception 'Bulk history batch not found';
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

  if history_count <> expected_count then
    raise exception 'Bulk track selection changed after history entry';
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

  if track_count <> expected_count then
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
    'restored_count', expected_count
  );
end;
$$;

drop function public.list_bulk_track_edit_batches(integer);

create function public.list_bulk_track_edit_batches(
  requested_limit integer default 10
)
returns table (
  batch_id uuid,
  track_count bigint,
  field_name text,
  previous_values jsonb,
  previous_value_count integer,
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
    b.id as batch_id,
    b.expected_count::bigint as track_count,
    b.field_name,
    b.previous_values,
    b.previous_value_count,
    b.created_at,
    max(h.undone_at) as undone_at,
    (
      count(h.id) = b.expected_count
      and count(t.id) = b.expected_count
      and coalesce(bool_and(
        h.undone_at is null
        and private.track_edit_snapshot(t) = h.after_state
      ), false)
    ) as can_undo
  from private.bulk_track_edit_batches b
  left join public.track_edit_history h
    on h.batch_id = b.id
   and h.user_id = b.user_id
   and h.change_kind = 'bulk_edit'
  left join public.tracks t
    on t.id = h.track_id
   and t.user_id = h.user_id
  where b.user_id = current_user_id
  group by
    b.id,
    b.expected_count,
    b.field_name,
    b.previous_values,
    b.previous_value_count,
    b.created_at
  order by
    (
      count(h.id) = b.expected_count
      and count(t.id) = b.expected_count
      and coalesce(bool_and(
        h.undone_at is null
        and private.track_edit_snapshot(t) = h.after_state
      ), false)
    ) desc,
    b.created_at desc,
    b.id desc
  limit safe_limit;
end;
$$;

revoke all on function public.list_bulk_track_edit_batches(integer)
  from public, anon;
grant execute on function public.list_bulk_track_edit_batches(integer)
  to authenticated;
