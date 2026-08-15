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
