create or replace function public.apply_manual_crate_order(
  requested_crate_id uuid,
  expected_track_ids uuid[],
  requested_track_ids uuid[]
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  actual_track_ids uuid[];
  actual_sorted_ids uuid[];
  requested_sorted_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if requested_crate_id is null then
    raise exception 'Invalid crate';
  end if;

  if cardinality(coalesce(expected_track_ids, array[]::uuid[])) > 20000
     or cardinality(coalesce(requested_track_ids, array[]::uuid[])) > 20000 then
    raise exception 'Too many tracks';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(requested_crate_id::text, 0));

  if not exists (
    select 1
    from public.crates c
    where c.id = requested_crate_id
      and c.user_id = current_user_id
      and c.smart_rules is null
  ) then
    raise exception 'Manual crate not found';
  end if;

  select coalesce(
    array_agg(ct.track_id order by ct.position, ct.created_at, ct.track_id),
    array[]::uuid[]
  )
  into actual_track_ids
  from public.crate_tracks ct
  where ct.crate_id = requested_crate_id
    and ct.user_id = current_user_id;

  if actual_track_ids is distinct from coalesce(expected_track_ids, array[]::uuid[]) then
    raise exception 'Crate changed after preview';
  end if;

  if cardinality(coalesce(requested_track_ids, array[]::uuid[]))
     <> cardinality(actual_track_ids) then
    raise exception 'Requested order does not match crate';
  end if;

  select coalesce(array_agg(track_id order by track_id), array[]::uuid[])
  into actual_sorted_ids
  from unnest(actual_track_ids) as current_order(track_id);

  select coalesce(array_agg(track_id order by track_id), array[]::uuid[])
  into requested_sorted_ids
  from unnest(coalesce(requested_track_ids, array[]::uuid[])) as requested_order(track_id);

  if actual_sorted_ids is distinct from requested_sorted_ids then
    raise exception 'Requested order does not match crate';
  end if;

  update public.crate_tracks ct
  set position = desired.ordinality::integer - 1
  from unnest(coalesce(requested_track_ids, array[]::uuid[]))
    with ordinality as desired(track_id, ordinality)
  where ct.crate_id = requested_crate_id
    and ct.user_id = current_user_id
    and ct.track_id = desired.track_id;

  update public.crates
  set updated_at = now()
  where id = requested_crate_id
    and user_id = current_user_id;

  return true;
end;
$$;

revoke all on function public.apply_manual_crate_order(uuid, uuid[], uuid[])
  from public, anon;
grant execute on function public.apply_manual_crate_order(uuid, uuid[], uuid[])
  to authenticated;
