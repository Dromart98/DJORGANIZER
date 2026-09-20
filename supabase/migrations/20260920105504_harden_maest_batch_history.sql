-- Keep the existing bulk history/undo contract. Each field write has its own
-- subtransaction, but writing the history is mandatory for committing the RPC.
create or replace function public.apply_maest_batch_with_history(requested_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  track_ids uuid[];
  item jsonb;
  field_name text;
  selection jsonb;
  patch jsonb;
  allowed_keys text[];
  item_id uuid;
  before_track public.tracks%rowtype;
  after_track public.tracks%rowtype;
  before_snapshot jsonb;
  after_snapshot jsonb;
  fields text[];
  statuses jsonb;
  results jsonb := '[]'::jsonb;
  batch_id uuid := gen_random_uuid();
  changed_count integer := 0;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(requested_items) is distinct from 'array' then
    raise exception 'Invalid MAEST batch';
  end if;
  if jsonb_array_length(requested_items) not between 1 and 25 then
    raise exception 'Invalid MAEST batch';
  end if;

  -- Validate the complete request before any writes, including direct RPC calls.
  for item in select value from jsonb_array_elements(requested_items) loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception 'Invalid MAEST batch item';
    end if;
    if jsonb_typeof(item -> 'track_id') is distinct from 'string'
       or not (item ? 'genre' or item ? 'subgenre')
       or exists (select 1 from jsonb_object_keys(item) k where k not in ('track_id', 'genre', 'subgenre')) then
      raise exception 'Invalid MAEST batch item';
    end if;
    item_id := (item ->> 'track_id')::uuid;
    track_ids := array_append(track_ids, item_id);
    foreach field_name in array array['genre', 'subgenre'] loop
      if not item ? field_name then continue; end if;
      selection := item -> field_name;
      if jsonb_typeof(selection) is distinct from 'object' then
        raise exception 'Invalid MAEST selection';
      end if;
      if not selection ? 'expected_value'
         or jsonb_typeof(selection -> 'expected_value') not in ('string', 'null')
         or length(selection ->> 'expected_value') > 120
         or jsonb_typeof(selection -> 'patch') is distinct from 'object'
         or exists (select 1 from jsonb_object_keys(selection) k where k not in ('expected_value', 'patch')) then
        raise exception 'Invalid MAEST selection';
      end if;
      patch := selection -> 'patch';
      allowed_keys := array[field_name, field_name || '_source', field_name || '_confidence',
        field_name || '_analyzer_id', field_name || '_analyzer_version',
        field_name || '_compatibility_key', field_name || '_analyzed_at_ms', field_name || '_raw_score'];
      if not patch ?& allowed_keys
         or exists (select 1 from jsonb_object_keys(patch) k where not k = any(allowed_keys))
         or jsonb_typeof(patch -> field_name) is distinct from 'string'
         or length(btrim(patch ->> field_name)) not between 1 and 120
         or (patch ->> field_name) is distinct from btrim(patch ->> field_name)
         or (patch ->> (field_name || '_source')) is distinct from 'automatic'
         or (patch -> (field_name || '_confidence')) is distinct from 'null'::jsonb
         or (patch ->> (field_name || '_analyzer_id')) is distinct from 'djorganizer.desktop.genre.maest'
         or (patch ->> (field_name || '_analyzer_version')) is distinct from 'discogs-maest-30s-pw-519l@2'
         or (patch ->> (field_name || '_compatibility_key')) is distinct from 'maest-519l|mel-16000-1876x96-f32|windows-start-center-end-mean|v3'
         or jsonb_typeof(patch -> (field_name || '_analyzed_at_ms')) is distinct from 'number'
         or jsonb_typeof(patch -> (field_name || '_raw_score')) is distinct from 'number' then
        raise exception 'Invalid MAEST evidence';
      end if;
      if (patch ->> (field_name || '_analyzed_at_ms')) !~ '^(0|[1-9][0-9]*)$'
         or (patch ->> (field_name || '_analyzed_at_ms'))::numeric > 9007199254740991
         or (patch ->> (field_name || '_raw_score'))::double precision in ('Infinity', '-Infinity', 'NaN') then
        raise exception 'Invalid MAEST evidence';
      end if;
    end loop;
  end loop;
  if cardinality(track_ids) <> (select count(distinct id) from unnest(track_ids) ids(id)) then
    raise exception 'Duplicate MAEST batch track';
  end if;

  -- A stable locking order protects compare-and-set and avoids reversed batches
  -- deadlocking. Unowned/missing tracks remain per-item failures.
  perform 1 from public.tracks t
  where t.user_id = owner_id and t.id = any(track_ids)
  order by t.id for update;

  for item in select value from jsonb_array_elements(requested_items) loop
    item_id := (item ->> 'track_id')::uuid;
    statuses := jsonb_build_object(
      'genre', case when item ? 'genre' then 'failed' else 'omitted' end,
      'subgenre', case when item ? 'subgenre' then 'failed' else 'omitted' end);
    select t.* into before_track from public.tracks t
    where t.id = item_id and t.user_id = owner_id;
    if found then
      before_snapshot := private.track_edit_snapshot(before_track);
      foreach field_name in array array['genre', 'subgenre'] loop
        if not item ? field_name then continue; end if;
        selection := item -> field_name;
        if (to_jsonb(before_track) -> field_name) is distinct from (selection -> 'expected_value') then
          statuses := statuses || jsonb_build_object(field_name, 'conflict');
          continue;
        end if;
        begin
          select populated.* into after_track
          from jsonb_populate_record(before_track, selection -> 'patch') populated;
          if field_name = 'genre' then
            update public.tracks t set
              genre = after_track.genre, genre_source = after_track.genre_source,
              genre_confidence = after_track.genre_confidence,
              genre_analyzer_id = after_track.genre_analyzer_id,
              genre_analyzer_version = after_track.genre_analyzer_version,
              genre_compatibility_key = after_track.genre_compatibility_key,
              genre_analyzed_at_ms = after_track.genre_analyzed_at_ms,
              genre_raw_score = after_track.genre_raw_score
            where t.id = item_id and t.user_id = owner_id
              and t.genre is not distinct from (selection ->> 'expected_value');
          else
            update public.tracks t set
              subgenre = after_track.subgenre, subgenre_source = after_track.subgenre_source,
              subgenre_confidence = after_track.subgenre_confidence,
              subgenre_analyzer_id = after_track.subgenre_analyzer_id,
              subgenre_analyzer_version = after_track.subgenre_analyzer_version,
              subgenre_compatibility_key = after_track.subgenre_compatibility_key,
              subgenre_analyzed_at_ms = after_track.subgenre_analyzed_at_ms,
              subgenre_raw_score = after_track.subgenre_raw_score
            where t.id = item_id and t.user_id = owner_id
              and t.subgenre is not distinct from (selection ->> 'expected_value');
          end if;
          statuses := statuses || jsonb_build_object(field_name, case when found then 'applied' else 'conflict' end);
        exception when others then
          statuses := statuses || jsonb_build_object(field_name, 'failed');
        end;
      end loop;
      select t.* into after_track from public.tracks t where t.id = item_id and t.user_id = owner_id;
      after_snapshot := private.track_edit_snapshot(after_track);
      if before_snapshot is distinct from after_snapshot then
        select array_agg(k order by k) into fields from jsonb_object_keys(after_snapshot) k
        where before_snapshot -> k is distinct from after_snapshot -> k;
        insert into public.track_edit_history
          (user_id, track_id, change_kind, batch_id, before_state, after_state, changed_fields)
        values (owner_id, item_id, 'bulk_edit', batch_id, before_snapshot, after_snapshot, fields);
        changed_count := changed_count + 1;
      end if;
    end if;
    results := results || jsonb_build_array(statuses || jsonb_build_object(
      'trackId', item_id,
      'status', case
        when statuses ->> 'genre' = 'failed' or statuses ->> 'subgenre' = 'failed' then 'failed'
        when statuses ->> 'genre' = 'conflict' or statuses ->> 'subgenre' = 'conflict' then 'conflict'
        when statuses ->> 'genre' = 'applied' or statuses ->> 'subgenre' = 'applied' then 'applied'
        else 'omitted' end));
  end loop;
  return jsonb_build_object('batch_id', case when changed_count > 0 then batch_id else null end,
    'changed_count', changed_count, 'items', results);
end;
$$;

revoke all on function public.apply_maest_batch_with_history(jsonb) from public, anon;
grant execute on function public.apply_maest_batch_with_history(jsonb) to authenticated;
