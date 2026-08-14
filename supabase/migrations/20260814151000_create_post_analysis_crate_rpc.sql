create or replace function public.create_post_analysis_crate(
  crate_name text,
  track_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_name text := trim(crate_name);
  invalid_track_count integer;
  new_crate_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if normalized_name is null
    or char_length(normalized_name) < 1
    or char_length(normalized_name) > 120 then
    raise exception 'Invalid crate name';
  end if;

  if track_ids is null
    or cardinality(track_ids) < 1
    or cardinality(track_ids) > 25 then
    raise exception 'Invalid track selection';
  end if;

  select count(*)
  into invalid_track_count
  from (
    select distinct requested.track_id
    from unnest(track_ids) as requested(track_id)
  ) requested
  left join public.tracks
    on tracks.id = requested.track_id
   and tracks.user_id = current_user_id
  where tracks.id is null;

  if invalid_track_count > 0 then
    raise exception 'One or more tracks do not belong to this library';
  end if;

  insert into public.crates (user_id, name, description)
  values (current_user_id, normalized_name, null)
  returning id into new_crate_id;

  insert into public.crate_tracks (user_id, crate_id, track_id, position)
  select
    current_user_id,
    new_crate_id,
    ordered.track_id,
    ordered.position
  from (
    select
      requested.track_id,
      min(requested.ordinality)::integer - 1 as position
    from unnest(track_ids) with ordinality as requested(track_id, ordinality)
    group by requested.track_id
  ) ordered;

  return new_crate_id;
end;
$$;

revoke all on function public.create_post_analysis_crate(text, uuid[])
  from public, anon;
grant execute on function public.create_post_analysis_crate(text, uuid[])
  to authenticated;
