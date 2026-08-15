create or replace function public.lock_crate_track_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  first_crate_id uuid;
  second_crate_id uuid;
begin
  if tg_op = 'UPDATE' and old.crate_id is distinct from new.crate_id then
    if old.crate_id::text < new.crate_id::text then
      first_crate_id := old.crate_id;
      second_crate_id := new.crate_id;
    else
      first_crate_id := new.crate_id;
      second_crate_id := old.crate_id;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(first_crate_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(second_crate_id::text, 0));
  else
    perform pg_advisory_xact_lock(
      hashtextextended(
        case when tg_op = 'DELETE' then old.crate_id else new.crate_id end::text,
        0
      )
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.lock_crate_track_mutation() from public, anon;

drop trigger if exists lock_crate_track_mutation on public.crate_tracks;
create trigger lock_crate_track_mutation
before insert or update or delete on public.crate_tracks
for each row execute function public.lock_crate_track_mutation();

create or replace function public.add_track_to_manual_crate(
  requested_crate_id uuid,
  requested_track_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  next_position integer;
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

  if exists (
    select 1
    from public.crate_tracks ct
    where ct.crate_id = requested_crate_id
      and ct.track_id = requested_track_id
      and ct.user_id = current_user_id
  ) then
    raise exception 'Track already in crate';
  end if;

  select coalesce(max(ct.position), -1) + 1
  into next_position
  from public.crate_tracks ct
  where ct.crate_id = requested_crate_id
    and ct.user_id = current_user_id;

  insert into public.crate_tracks (user_id, crate_id, track_id, position)
  values (current_user_id, requested_crate_id, requested_track_id, next_position);

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

create or replace function public.move_track_in_manual_crate(
  requested_crate_id uuid,
  requested_track_id uuid,
  requested_direction text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  ordered_track_ids uuid[];
  current_index integer;
  target_index integer;
  moved_track_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if requested_crate_id is null
     or requested_track_id is null
     or requested_direction not in ('up', 'down') then
    raise exception 'Invalid crate reorder';
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
  into ordered_track_ids
  from public.crate_tracks ct
  where ct.crate_id = requested_crate_id
    and ct.user_id = current_user_id;

  current_index := array_position(ordered_track_ids, requested_track_id);
  if current_index is null then
    raise exception 'Track not found in crate';
  end if;

  target_index := case requested_direction
    when 'up' then current_index - 1
    else current_index + 1
  end;

  if target_index < 1 or target_index > cardinality(ordered_track_ids) then
    return false;
  end if;

  moved_track_id := ordered_track_ids[target_index];
  ordered_track_ids[target_index] := ordered_track_ids[current_index];
  ordered_track_ids[current_index] := moved_track_id;

  update public.crate_tracks ct
  set position = desired.ordinality::integer - 1
  from unnest(ordered_track_ids) with ordinality as desired(track_id, ordinality)
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

revoke all on function public.move_track_in_manual_crate(uuid, uuid, text)
  from public, anon;
grant execute on function public.move_track_in_manual_crate(uuid, uuid, text)
  to authenticated;

create or replace function public.merge_manual_crates(
  source_crate_id uuid,
  target_crate_id uuid,
  expected_source_track_ids uuid[],
  expected_target_track_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  actual_source_track_ids uuid[];
  actual_target_track_ids uuid[];
  desired_track_ids uuid[];
  owned_manual_crates integer;
  added_count integer;
  final_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if source_crate_id is null
     or target_crate_id is null
     or source_crate_id = target_crate_id then
    raise exception 'Choose two different crates';
  end if;

  if cardinality(coalesce(expected_source_track_ids, array[]::uuid[])) > 20000
     or cardinality(coalesce(expected_target_track_ids, array[]::uuid[])) > 20000 then
    raise exception 'Too many tracks';
  end if;

  if source_crate_id::text < target_crate_id::text then
    perform pg_advisory_xact_lock(hashtextextended(source_crate_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(target_crate_id::text, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended(target_crate_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(source_crate_id::text, 0));
  end if;

  select count(*)::integer
  into owned_manual_crates
  from public.crates
  where id = any(array[source_crate_id, target_crate_id])
    and user_id = current_user_id
    and smart_rules is null;

  if owned_manual_crates <> 2 then
    raise exception 'Manual crate not found';
  end if;

  select coalesce(
    array_agg(track_id order by position, created_at, track_id),
    array[]::uuid[]
  )
  into actual_source_track_ids
  from public.crate_tracks
  where crate_id = source_crate_id
    and user_id = current_user_id;

  select coalesce(
    array_agg(track_id order by position, created_at, track_id),
    array[]::uuid[]
  )
  into actual_target_track_ids
  from public.crate_tracks
  where crate_id = target_crate_id
    and user_id = current_user_id;

  if actual_source_track_ids is distinct from coalesce(expected_source_track_ids, array[]::uuid[])
     or actual_target_track_ids is distinct from coalesce(expected_target_track_ids, array[]::uuid[]) then
    raise exception 'Crate changed after preview';
  end if;

  select coalesce(
    array_agg(candidate.track_id order by candidate.group_order, candidate.ordinality),
    array[]::uuid[]
  )
  into desired_track_ids
  from (
    select target.track_id, 0 as group_order, target.ordinality
    from unnest(actual_target_track_ids) with ordinality as target(track_id, ordinality)

    union all

    select source.track_id, 1 as group_order, source.ordinality
    from unnest(actual_source_track_ids) with ordinality as source(track_id, ordinality)
    where not (source.track_id = any(actual_target_track_ids))
  ) candidate;

  final_count := cardinality(desired_track_ids);
  if final_count > 20000 then
    raise exception 'Merged crate would exceed 20000 tracks';
  end if;

  added_count := final_count - cardinality(actual_target_track_ids);

  insert into public.crate_tracks (user_id, crate_id, track_id, position)
  select
    current_user_id,
    target_crate_id,
    requested.track_id,
    requested.ordinality::integer - 1
  from unnest(desired_track_ids) with ordinality as requested(track_id, ordinality)
  on conflict (crate_id, track_id)
  do update set position = excluded.position;

  update public.crates
  set updated_at = now()
  where id = target_crate_id
    and user_id = current_user_id;

  return jsonb_build_object(
    'added_count', added_count,
    'final_count', final_count,
    'source_crate_id', source_crate_id,
    'target_crate_id', target_crate_id
  );
end;
$$;

revoke all on function public.merge_manual_crates(uuid, uuid, uuid[], uuid[])
  from public, anon;
grant execute on function public.merge_manual_crates(uuid, uuid, uuid[], uuid[])
  to authenticated;
