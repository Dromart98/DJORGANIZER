create or replace function public.add_track_to_manual_crate(
  requested_crate_id uuid,
  requested_track_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  next_position integer;
  before_track_ids uuid[];
  after_track_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if requested_crate_id is null or requested_track_id is null then
    raise exception 'Invalid crate track assignment';
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

  if not exists (
    select 1
    from public.tracks t
    where t.id = requested_track_id
      and t.user_id = current_user_id
  ) then
    raise exception 'Track not found';
  end if;

  before_track_ids := private.manual_crate_order(requested_crate_id, current_user_id);
  if cardinality(before_track_ids) >= 20000 then
    raise exception 'Too many tracks';
  end if;

  if requested_track_id = any(before_track_ids) then
    raise exception 'Track already in crate';
  end if;

  select coalesce(max(ct.position), -1) + 1
  into next_position
  from public.crate_tracks ct
  where ct.crate_id = requested_crate_id
    and ct.user_id = current_user_id;

  insert into public.crate_tracks (user_id, crate_id, track_id, position)
  values (current_user_id, requested_crate_id, requested_track_id, next_position);

  after_track_ids := private.manual_crate_order(requested_crate_id, current_user_id);
  perform private.record_manual_crate_history(
    current_user_id,
    requested_crate_id,
    'add',
    before_track_ids,
    after_track_ids
  );

  update public.crates
  set updated_at = now()
  where id = requested_crate_id
    and user_id = current_user_id;

  return next_position;
end;
$$;

revoke all on function public.add_track_to_manual_crate(uuid, uuid)
  from public, anon;
grant execute on function public.add_track_to_manual_crate(uuid, uuid)
  to authenticated;
