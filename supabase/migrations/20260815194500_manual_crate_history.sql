create table private.manual_crate_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  crate_id uuid not null,
  crate_name text not null,
  change_kind text not null
    check (change_kind in ('add', 'remove', 'move', 'sort', 'merge', 'reconcile')),
  before_track_ids uuid[] not null,
  after_track_ids uuid[] not null,
  revision bigint generated always as identity,
  created_at timestamptz not null default clock_timestamp(),
  undone_at timestamptz,
  check (cardinality(before_track_ids) <= 20000),
  check (cardinality(after_track_ids) <= 20000),
  check (before_track_ids is distinct from after_track_ids)
);

create unique index manual_crate_history_user_revision_idx
  on private.manual_crate_history (user_id, revision);
create index manual_crate_history_user_crate_revision_idx
  on private.manual_crate_history (user_id, crate_id, revision desc);

revoke all on private.manual_crate_history
  from public, anon, authenticated, service_role;

create or replace function private.manual_crate_order(
  requested_crate_id uuid,
  requested_user_id uuid
)
returns uuid[]
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    array_agg(ct.track_id order by ct.position, ct.created_at, ct.track_id),
    array[]::uuid[]
  )
  from public.crate_tracks ct
  where ct.crate_id = requested_crate_id
    and ct.user_id = requested_user_id;
$$;

revoke all on function private.manual_crate_order(uuid, uuid)
  from public, anon, authenticated, service_role;

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
    and c.user_id = requested_user_id;

  if not found then
    raise exception 'Crate not found';
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

  next_position := cardinality(before_track_ids);

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

create or replace function public.remove_track_from_manual_crate(
  requested_crate_id uuid,
  requested_track_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  before_track_ids uuid[];
  after_track_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if requested_crate_id is null or requested_track_id is null then
    raise exception 'Invalid crate track removal';
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

  before_track_ids := private.manual_crate_order(requested_crate_id, current_user_id);
  if not (requested_track_id = any(before_track_ids)) then
    raise exception 'Track not found in crate';
  end if;

  delete from public.crate_tracks ct
  where ct.crate_id = requested_crate_id
    and ct.track_id = requested_track_id
    and ct.user_id = current_user_id;

  after_track_ids := private.manual_crate_order(requested_crate_id, current_user_id);

  update public.crate_tracks ct
  set position = desired.ordinality::integer - 1
  from unnest(after_track_ids) with ordinality as desired(track_id, ordinality)
  where ct.crate_id = requested_crate_id
    and ct.user_id = current_user_id
    and ct.track_id = desired.track_id;

  perform private.record_manual_crate_history(
    current_user_id,
    requested_crate_id,
    'remove',
    before_track_ids,
    after_track_ids
  );

  update public.crates
  set updated_at = now()
  where id = requested_crate_id
    and user_id = current_user_id;

  return true;
end;
$$;

revoke all on function public.remove_track_from_manual_crate(uuid, uuid)
  from public, anon;
grant execute on function public.remove_track_from_manual_crate(uuid, uuid)
  to authenticated;

create or replace function public.move_track_in_manual_crate(
  requested_crate_id uuid,
  requested_track_id uuid,
  requested_direction text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  before_track_ids uuid[];
  after_track_ids uuid[];
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

  before_track_ids := private.manual_crate_order(requested_crate_id, current_user_id);

  current_index := array_position(before_track_ids, requested_track_id);
  if current_index is null then
    raise exception 'Track not found in crate';
  end if;

  target_index := case requested_direction
    when 'up' then current_index - 1
    else current_index + 1
  end;

  if target_index < 1 or target_index > cardinality(before_track_ids) then
    return false;
  end if;

  after_track_ids := before_track_ids;
  moved_track_id := after_track_ids[target_index];
  after_track_ids[target_index] := after_track_ids[current_index];
  after_track_ids[current_index] := moved_track_id;

  update public.crate_tracks ct
  set position = desired.ordinality::integer - 1
  from unnest(after_track_ids) with ordinality as desired(track_id, ordinality)
  where ct.crate_id = requested_crate_id
    and ct.user_id = current_user_id
    and ct.track_id = desired.track_id;

  perform private.record_manual_crate_history(
    current_user_id,
    requested_crate_id,
    'move',
    before_track_ids,
    after_track_ids
  );

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

create or replace function public.apply_manual_crate_order(
  requested_crate_id uuid,
  expected_track_ids uuid[],
  requested_track_ids uuid[]
)
returns boolean
language plpgsql
security definer
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

  actual_track_ids := private.manual_crate_order(requested_crate_id, current_user_id);

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

  perform private.record_manual_crate_history(
    current_user_id,
    requested_crate_id,
    'sort',
    actual_track_ids,
    coalesce(requested_track_ids, array[]::uuid[])
  );

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

create or replace function public.merge_manual_crates(
  source_crate_id uuid,
  target_crate_id uuid,
  expected_source_track_ids uuid[],
  expected_target_track_ids uuid[]
)
returns jsonb
language plpgsql
security definer
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

  actual_source_track_ids := private.manual_crate_order(source_crate_id, current_user_id);
  actual_target_track_ids := private.manual_crate_order(target_crate_id, current_user_id);

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

  perform private.record_manual_crate_history(
    current_user_id,
    target_crate_id,
    'merge',
    actual_target_track_ids,
    desired_track_ids
  );

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

create or replace function public.reconcile_crate_tracks(
  target_crate_id uuid,
  desired_track_ids uuid[],
  remove_missing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invalid_track_count integer;
  removed_count integer := 0;
  saved_count integer := 0;
  before_track_ids uuid[];
  after_track_ids uuid[];
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if target_crate_id is null or desired_track_ids is null then
    raise exception 'Invalid crate reconciliation';
  end if;

  if cardinality(desired_track_ids) > 10000 then
    raise exception 'Too many tracks';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_crate_id::text, 0));

  if not exists (
    select 1
    from public.crates c
    where c.id = target_crate_id
      and c.user_id = current_user_id
  ) then
    raise exception 'Crate not found';
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

  before_track_ids := private.manual_crate_order(target_crate_id, current_user_id);

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

  after_track_ids := private.manual_crate_order(target_crate_id, current_user_id);
  perform private.record_manual_crate_history(
    current_user_id,
    target_crate_id,
    'reconcile',
    before_track_ids,
    after_track_ids
  );

  update public.crates
  set updated_at = now()
  where id = target_crate_id
    and user_id = current_user_id;

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

create or replace function public.list_manual_crate_history(
  requested_crate_id uuid,
  requested_limit integer default 10
)
returns table (
  id uuid,
  change_kind text,
  before_count integer,
  after_count integer,
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
  current_track_ids uuid[];
  safe_limit integer := greatest(1, least(coalesce(requested_limit, 10), 50));
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.crates c
    where c.id = requested_crate_id
      and c.user_id = current_user_id
      and c.smart_rules is null
  ) then
    raise exception 'Manual crate not found';
  end if;

  current_track_ids := private.manual_crate_order(requested_crate_id, current_user_id);

  return query
  select
    history.id,
    history.change_kind,
    cardinality(history.before_track_ids),
    cardinality(history.after_track_ids),
    history.created_at,
    history.undone_at,
    history.undone_at is null
      and history.after_track_ids = current_track_ids
      and not exists (
        select 1
        from private.manual_crate_history newer
        where newer.user_id = history.user_id
          and newer.crate_id = history.crate_id
          and newer.revision > history.revision
          and newer.undone_at is null
      ) as can_undo
  from private.manual_crate_history history
  where history.user_id = current_user_id
    and history.crate_id = requested_crate_id
  order by
    (
      history.undone_at is null
      and history.after_track_ids = current_track_ids
      and not exists (
        select 1
        from private.manual_crate_history newer
        where newer.user_id = history.user_id
          and newer.crate_id = history.crate_id
          and newer.revision > history.revision
          and newer.undone_at is null
      )
    ) desc,
    history.revision desc
  limit safe_limit;
end;
$$;

revoke all on function public.list_manual_crate_history(uuid, integer)
  from public, anon;
grant execute on function public.list_manual_crate_history(uuid, integer)
  to authenticated;

create or replace function public.undo_manual_crate_history(
  requested_history_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  history_row private.manual_crate_history%rowtype;
  current_track_ids uuid[];
  valid_before_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if requested_history_id is null then
    raise exception 'Invalid crate history entry';
  end if;

  select history.*
  into history_row
  from private.manual_crate_history history
  where history.id = requested_history_id
    and history.user_id = current_user_id
  for update;

  if not found then
    raise exception 'Crate history entry not found';
  end if;
  if history_row.undone_at is not null then
    raise exception 'Crate history entry already undone';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(history_row.crate_id::text, 0));

  if not exists (
    select 1
    from public.crates c
    where c.id = history_row.crate_id
      and c.user_id = current_user_id
      and c.smart_rules is null
  ) then
    raise exception 'Manual crate not found';
  end if;

  if exists (
    select 1
    from private.manual_crate_history newer
    where newer.user_id = current_user_id
      and newer.crate_id = history_row.crate_id
      and newer.revision > history_row.revision
      and newer.undone_at is null
  ) then
    raise exception 'Crate history entry was superseded by a later change';
  end if;

  current_track_ids := private.manual_crate_order(history_row.crate_id, current_user_id);
  if current_track_ids is distinct from history_row.after_track_ids then
    raise exception 'Crate changed after history entry';
  end if;

  select count(*)::integer
  into valid_before_count
  from public.tracks t
  where t.user_id = current_user_id
    and t.id = any(history_row.before_track_ids);

  if valid_before_count <> cardinality(history_row.before_track_ids) then
    raise exception 'Crate history references tracks that are no longer available';
  end if;

  delete from public.crate_tracks ct
  where ct.crate_id = history_row.crate_id
    and ct.user_id = current_user_id;

  insert into public.crate_tracks (user_id, crate_id, track_id, position)
  select
    current_user_id,
    history_row.crate_id,
    requested.track_id,
    requested.ordinality::integer - 1
  from unnest(history_row.before_track_ids)
    with ordinality as requested(track_id, ordinality);

  update public.crates
  set updated_at = now()
  where id = history_row.crate_id
    and user_id = current_user_id;

  update private.manual_crate_history history
  set undone_at = clock_timestamp()
  where history.id = history_row.id;

  return jsonb_build_object(
    'crate_id', history_row.crate_id,
    'history_id', history_row.id,
    'restored_count', cardinality(history_row.before_track_ids)
  );
end;
$$;

revoke all on function public.undo_manual_crate_history(uuid)
  from public, anon;
grant execute on function public.undo_manual_crate_history(uuid)
  to authenticated;
