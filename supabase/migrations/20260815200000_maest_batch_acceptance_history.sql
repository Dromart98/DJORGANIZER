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
  touched_count integer := 0;
  touches_album boolean;
  touches_genre boolean;
  touches_subgenre boolean;
  touches_bpm boolean;
  touches_key boolean;
  touches_energy boolean;
  touches_rating boolean;
  touches_year boolean;
  touches_comments boolean;
begin
  if new.change_kind <> 'bulk_edit' or new.batch_id is null then
    return new;
  end if;

  touches_album := new.changed_fields && array['album']::text[];
  touches_genre := new.changed_fields && array[
    'genre', 'genre_analyzed_at_ms', 'genre_analyzer_id',
    'genre_analyzer_version', 'genre_compatibility_key', 'genre_confidence',
    'genre_raw_score', 'genre_source'
  ]::text[];
  touches_subgenre := new.changed_fields && array[
    'subgenre', 'subgenre_analyzed_at_ms', 'subgenre_analyzer_id',
    'subgenre_analyzer_version', 'subgenre_compatibility_key',
    'subgenre_confidence', 'subgenre_raw_score', 'subgenre_source'
  ]::text[];
  touches_bpm := new.changed_fields && array[
    'bpm', 'bpm_confidence', 'bpm_explanation', 'bpm_source'
  ]::text[];
  touches_key := new.changed_fields && array[
    'musical_key', 'camelot_key', 'key_confidence', 'key_explanation', 'key_source'
  ]::text[];
  touches_energy := new.changed_fields && array[
    'energy', 'energy_confidence', 'energy_source'
  ]::text[];
  touches_rating := new.changed_fields && array['rating']::text[];
  touches_year := new.changed_fields && array['release_year']::text[];
  touches_comments := new.changed_fields && array['comments']::text[];

  touched_count :=
    touches_album::integer +
    touches_genre::integer +
    touches_subgenre::integer +
    touches_bpm::integer +
    touches_key::integer +
    touches_energy::integer +
    touches_rating::integer +
    touches_year::integer +
    touches_comments::integer;

  logical_field := case
    when touched_count <> 1 then 'multiple'
    when touches_album then 'album'
    when touches_genre then 'genre'
    when touches_subgenre then 'subgenre'
    when touches_bpm then 'bpm'
    when touches_key then 'musical_key'
    when touches_energy then 'energy'
    when touches_rating then 'rating'
    when touches_year then 'release_year'
    when touches_comments then 'comments'
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

create or replace function public.apply_maest_batch_with_history(
  requested_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  item_count integer;
  requested_track_ids uuid[];
  item jsonb;
  item_track_id uuid;
  genre_request jsonb;
  subgenre_request jsonb;
  genre_expected text;
  subgenre_expected text;
  genre_status text;
  subgenre_status text;
  overall_status text;
  before_track public.tracks%rowtype;
  after_track public.tracks%rowtype;
  before_snapshot jsonb;
  after_snapshot jsonb;
  changed_fields text[];
  results jsonb := '[]'::jsonb;
  new_batch_id uuid := gen_random_uuid();
  changed_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if requested_items is null or jsonb_typeof(requested_items) <> 'array' then
    raise exception 'Invalid MAEST batch';
  end if;

  item_count := jsonb_array_length(requested_items);
  if item_count < 1 or item_count > 25 then
    raise exception 'Invalid MAEST batch';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(requested_items) as requested(item)
    where jsonb_typeof(requested.item) <> 'object'
      or not (requested.item ? 'track_id')
      or (not (requested.item ? 'genre') and not (requested.item ? 'subgenre'))
      or exists (
        select 1
        from jsonb_object_keys(requested.item) as top_key(key)
        where top_key.key not in ('track_id', 'genre', 'subgenre')
      )
  ) then
    raise exception 'Invalid MAEST batch item';
  end if;

  begin
    select array_agg((requested.item ->> 'track_id')::uuid)
    into requested_track_ids
    from jsonb_array_elements(requested_items) as requested(item);
  exception when others then
    raise exception 'Invalid MAEST batch track id';
  end;

  if cardinality(requested_track_ids) <> (
    select count(distinct track_id)
    from unnest(requested_track_ids) as requested(track_id)
  ) then
    raise exception 'Duplicate MAEST batch track';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(requested_items) as requested(item)
    cross join lateral jsonb_each(requested.item) as field_entry(field_name, field_value)
    where field_entry.field_name in ('genre', 'subgenre')
      and (
        jsonb_typeof(field_entry.field_value) <> 'object'
        or not (field_entry.field_value ? 'expected_value')
        or not (field_entry.field_value ? 'patch')
        or jsonb_typeof(field_entry.field_value -> 'patch') <> 'object'
        or exists (
          select 1
          from jsonb_object_keys(field_entry.field_value) as selection_key(key)
          where selection_key.key not in ('expected_value', 'patch')
        )
        or exists (
          select 1
          from jsonb_object_keys(field_entry.field_value -> 'patch') as patch_key(key)
          where patch_key.key not in (
            case field_entry.field_name
              when 'genre' then 'genre'
              else 'subgenre'
            end,
            case field_entry.field_name
              when 'genre' then 'genre_source'
              else 'subgenre_source'
            end,
            case field_entry.field_name
              when 'genre' then 'genre_confidence'
              else 'subgenre_confidence'
            end,
            case field_entry.field_name
              when 'genre' then 'genre_analyzer_id'
              else 'subgenre_analyzer_id'
            end,
            case field_entry.field_name
              when 'genre' then 'genre_analyzer_version'
              else 'subgenre_analyzer_version'
            end,
            case field_entry.field_name
              when 'genre' then 'genre_compatibility_key'
              else 'subgenre_compatibility_key'
            end,
            case field_entry.field_name
              when 'genre' then 'genre_analyzed_at_ms'
              else 'subgenre_analyzed_at_ms'
            end,
            case field_entry.field_name
              when 'genre' then 'genre_raw_score'
              else 'subgenre_raw_score'
            end
          )
        )
      )
  ) then
    raise exception 'Invalid MAEST batch patch';
  end if;

  perform 1
  from public.tracks track
  where track.user_id = current_user_id
    and track.id = any(requested_track_ids)
  order by track.id
  for update;

  for item in
    select requested.item
    from jsonb_array_elements(requested_items) with ordinality as requested(item, ordinality)
    order by requested.ordinality
  loop
    item_track_id := (item ->> 'track_id')::uuid;
    genre_request := item -> 'genre';
    subgenre_request := item -> 'subgenre';
    genre_status := case when genre_request is null then 'omitted' else 'failed' end;
    subgenre_status := case when subgenre_request is null then 'omitted' else 'failed' end;

    select track.*
    into before_track
    from public.tracks track
    where track.id = item_track_id
      and track.user_id = current_user_id;

    if not found then
      overall_status := 'failed';
      results := results || jsonb_build_array(jsonb_build_object(
        'trackId', item_track_id,
        'genre', genre_status,
        'subgenre', subgenre_status,
        'status', overall_status
      ));
      continue;
    end if;

    after_track := before_track;

    if genre_request is not null then
      genre_expected := case
        when genre_request -> 'expected_value' = 'null'::jsonb then null
        else genre_request ->> 'expected_value'
      end;
      if before_track.genre is distinct from genre_expected then
        genre_status := 'conflict';
      else
        select populated.*
        into after_track
        from jsonb_populate_record(after_track, genre_request -> 'patch') as populated;
        genre_status := 'applied';
      end if;
    end if;

    if subgenre_request is not null then
      subgenre_expected := case
        when subgenre_request -> 'expected_value' = 'null'::jsonb then null
        else subgenre_request ->> 'expected_value'
      end;
      if before_track.subgenre is distinct from subgenre_expected then
        subgenre_status := 'conflict';
      else
        select populated.*
        into after_track
        from jsonb_populate_record(after_track, subgenre_request -> 'patch') as populated;
        subgenre_status := 'applied';
      end if;
    end if;

    before_snapshot := private.track_edit_snapshot(before_track);
    after_snapshot := private.track_edit_snapshot(after_track);

    if before_snapshot is distinct from after_snapshot then
      select coalesce(array_agg(field order by field), array[]::text[])
      into changed_fields
      from jsonb_object_keys(after_snapshot) as changed(field)
      where before_snapshot -> changed.field is distinct from after_snapshot -> changed.field;

      update public.tracks track
      set
        genre = after_track.genre,
        genre_analyzed_at_ms = after_track.genre_analyzed_at_ms,
        genre_analyzer_id = after_track.genre_analyzer_id,
        genre_analyzer_version = after_track.genre_analyzer_version,
        genre_compatibility_key = after_track.genre_compatibility_key,
        genre_confidence = after_track.genre_confidence,
        genre_raw_score = after_track.genre_raw_score,
        genre_source = after_track.genre_source,
        subgenre = after_track.subgenre,
        subgenre_analyzed_at_ms = after_track.subgenre_analyzed_at_ms,
        subgenre_analyzer_id = after_track.subgenre_analyzer_id,
        subgenre_analyzer_version = after_track.subgenre_analyzer_version,
        subgenre_compatibility_key = after_track.subgenre_compatibility_key,
        subgenre_confidence = after_track.subgenre_confidence,
        subgenre_raw_score = after_track.subgenre_raw_score,
        subgenre_source = after_track.subgenre_source
      where track.id = item_track_id
        and track.user_id = current_user_id;

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
        item_track_id,
        'bulk_edit',
        new_batch_id,
        before_snapshot,
        after_snapshot,
        changed_fields
      );

      changed_count := changed_count + 1;
    end if;

    overall_status := case
      when genre_status = 'failed' or subgenre_status = 'failed' then 'failed'
      when genre_status = 'conflict' or subgenre_status = 'conflict' then 'conflict'
      when genre_status = 'applied' or subgenre_status = 'applied' then 'applied'
      else 'omitted'
    end;

    results := results || jsonb_build_array(jsonb_build_object(
      'trackId', item_track_id,
      'genre', genre_status,
      'subgenre', subgenre_status,
      'status', overall_status
    ));
  end loop;

  return jsonb_build_object(
    'batch_id', case when changed_count > 0 then new_batch_id else null end,
    'changed_count', changed_count,
    'items', results
  );
end;
$$;

revoke all on function public.apply_maest_batch_with_history(jsonb)
  from public, anon;
grant execute on function public.apply_maest_batch_with_history(jsonb)
  to authenticated;
