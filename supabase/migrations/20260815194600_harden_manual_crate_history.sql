create index manual_crate_history_active_crate_revision_idx
  on private.manual_crate_history (user_id, crate_id, revision desc)
  where undone_at is null;

create or replace function private.record_manual_crate_history(
  requested_user_id uuid,
  requested_crate_id uuid,
  requested_change_kind text,
  requested_before_track_ids uuid[],
  requested_after_track_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  crate_name text;
  history_id uuid;
begin
  if requested_before_track_ids is not distinct from requested_after_track_ids then
    return null;
  end if;

  if cardinality(coalesce(requested_before_track_ids, array[]::uuid[])) > 20000
     or cardinality(coalesce(requested_after_track_ids, array[]::uuid[])) > 20000 then
    raise exception 'Too many tracks';
  end if;

  select c.name
  into crate_name
  from public.crates c
  where c.id = requested_crate_id
    and c.user_id = requested_user_id
    and c.smart_rules is null;

  if not found then
    return null;
  end if;

  insert into private.manual_crate_history (
    user_id,
    crate_id,
    crate_name,
    change_kind,
    before_track_ids,
    after_track_ids
  )
  values (
    requested_user_id,
    requested_crate_id,
    crate_name,
    requested_change_kind,
    coalesce(requested_before_track_ids, array[]::uuid[]),
    coalesce(requested_after_track_ids, array[]::uuid[])
  )
  returning id into history_id;

  return history_id;
end;
$$;

revoke all on function private.record_manual_crate_history(uuid, uuid, text, uuid[], uuid[])
  from public, anon, authenticated, service_role;

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
