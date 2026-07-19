create or replace function public.reconcile_crate_tracks(
  target_crate_id uuid,
  desired_track_ids uuid[],
  remove_missing boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invalid_track_count integer;
  removed_count integer := 0;
  saved_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.crates
    where id = target_crate_id and user_id = current_user_id
  ) then
    raise exception 'Crate not found';
  end if;

  if cardinality(desired_track_ids) > 10000 then
    raise exception 'Too many tracks';
  end if;

  select count(*)
  into invalid_track_count
  from (
    select distinct requested.track_id
    from unnest(desired_track_ids) as requested(track_id)
  ) requested
  left join public.tracks
    on tracks.id = requested.track_id
   and tracks.user_id = current_user_id
  where tracks.id is null;

  if invalid_track_count > 0 then
    raise exception 'One or more tracks do not belong to this library';
  end if;

  if remove_missing then
    delete from public.crate_tracks
    where crate_id = target_crate_id
      and user_id = current_user_id
      and not (track_id = any(desired_track_ids));
    get diagnostics removed_count = row_count;
  end if;

  insert into public.crate_tracks (user_id, crate_id, track_id, position)
  select
    current_user_id,
    target_crate_id,
    ordered.track_id,
    ordered.position
  from (
    select track_id, min(ordinality)::integer - 1 as position
    from unnest(desired_track_ids) with ordinality as requested(track_id, ordinality)
    group by track_id
  ) ordered
  on conflict (crate_id, track_id)
  do update set position = excluded.position;
  get diagnostics saved_count = row_count;

  return jsonb_build_object(
    'removed_count', removed_count,
    'saved_count', saved_count
  );
end;
$$;

revoke all on function public.reconcile_crate_tracks(uuid, uuid[], boolean)
  from public, anon;
grant execute on function public.reconcile_crate_tracks(uuid, uuid[], boolean)
  to authenticated;
