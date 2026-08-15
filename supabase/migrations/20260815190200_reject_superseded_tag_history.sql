alter table private.track_tag_history
  add column revision bigint generated always as identity;

create unique index track_tag_history_user_revision_idx
  on private.track_tag_history (user_id, revision);

create or replace function public.list_track_tag_history(
  requested_limit integer default 10
)
returns table (
  id uuid,
  tag_name text,
  operation text,
  track_count integer,
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
  safe_limit integer := greatest(1, least(coalesce(requested_limit, 10), 50));
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    history.id,
    history.tag_name,
    history.operation,
    cardinality(history.track_ids),
    history.created_at,
    history.undone_at,
    history.undone_at is null
      and not exists (
        select 1
        from private.track_tag_history newer
        where newer.user_id = history.user_id
          and newer.tag_id = history.tag_id
          and newer.revision > history.revision
          and newer.undone_at is null
          and newer.track_ids && history.track_ids
      )
      and exists (
        select 1
        from public.tags tag
        where tag.id = history.tag_id
          and tag.user_id = current_user_id
      )
      and (
        select count(*)::integer
        from public.tracks track
        where track.user_id = current_user_id
          and track.id = any(history.track_ids)
      ) = cardinality(history.track_ids)
      and (
        select count(*)::integer
        from public.track_tags assignment
        where assignment.user_id = current_user_id
          and assignment.tag_id = history.tag_id
          and assignment.track_id = any(history.track_ids)
      ) = case
        when history.operation = 'add' then cardinality(history.track_ids)
        else 0
      end as can_undo
  from private.track_tag_history history
  where history.user_id = current_user_id
  order by
    (
      history.undone_at is null
      and not exists (
        select 1
        from private.track_tag_history newer
        where newer.user_id = history.user_id
          and newer.tag_id = history.tag_id
          and newer.revision > history.revision
          and newer.undone_at is null
          and newer.track_ids && history.track_ids
      )
      and exists (
        select 1
        from public.tags tag
        where tag.id = history.tag_id
          and tag.user_id = current_user_id
      )
      and (
        select count(*)::integer
        from public.tracks track
        where track.user_id = current_user_id
          and track.id = any(history.track_ids)
      ) = cardinality(history.track_ids)
      and (
        select count(*)::integer
        from public.track_tags assignment
        where assignment.user_id = current_user_id
          and assignment.tag_id = history.tag_id
          and assignment.track_id = any(history.track_ids)
      ) = case
        when history.operation = 'add' then cardinality(history.track_ids)
        else 0
      end
    ) desc,
    history.revision desc
  limit safe_limit;
end;
$$;

revoke all on function public.list_track_tag_history(integer) from public, anon;
grant execute on function public.list_track_tag_history(integer) to authenticated;

create or replace function public.undo_track_tag_history(
  requested_history_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  history_row private.track_tag_history%rowtype;
  expected_count integer;
  membership_count integer;
  changed_count integer;
  previous_skip_history text := coalesce(
    current_setting('djorganizer.skip_tag_history', true),
    ''
  );
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if requested_history_id is null then
    raise exception 'Invalid tag history entry';
  end if;

  select history.*
  into history_row
  from private.track_tag_history history
  where history.id = requested_history_id
    and history.user_id = current_user_id
  for update;

  if not found then
    raise exception 'Tag history entry not found';
  end if;
  if history_row.undone_at is not null then
    raise exception 'Tag history entry already undone';
  end if;

  perform 1
  from public.tags tag
  where tag.id = history_row.tag_id
    and tag.user_id = current_user_id
  for update;
  if not found then
    raise exception 'Tag changed after history entry';
  end if;

  perform 1
  from public.tracks track
  where track.user_id = current_user_id
    and track.id = any(history_row.track_ids)
  order by track.id
  for update;

  if exists (
    select 1
    from private.track_tag_history newer
    where newer.user_id = current_user_id
      and newer.tag_id = history_row.tag_id
      and newer.revision > history_row.revision
      and newer.undone_at is null
      and newer.track_ids && history_row.track_ids
  ) then
    raise exception 'Tag history entry was superseded by a later change';
  end if;

  expected_count := cardinality(history_row.track_ids);
  if (
    select count(*)::integer
    from public.tracks track
    where track.user_id = current_user_id
      and track.id = any(history_row.track_ids)
  ) <> expected_count then
    raise exception 'Track selection changed after tag history entry';
  end if;

  select count(*)::integer
  into membership_count
  from public.track_tags assignment
  where assignment.user_id = current_user_id
    and assignment.tag_id = history_row.tag_id
    and assignment.track_id = any(history_row.track_ids);

  if membership_count <> (
    case
      when history_row.operation = 'add' then expected_count
      else 0
    end
  ) then
    raise exception 'Track tag state changed after history entry';
  end if;

  perform set_config('djorganizer.skip_tag_history', '1', true);

  if history_row.operation = 'add' then
    with removed as (
      delete from public.track_tags assignment
      where assignment.user_id = current_user_id
        and assignment.tag_id = history_row.tag_id
        and assignment.track_id = any(history_row.track_ids)
      returning assignment.track_id
    )
    select count(*)::integer into changed_count from removed;
  else
    with restored as (
      insert into public.track_tags (user_id, tag_id, track_id)
      select current_user_id, history_row.tag_id, track_id
      from unnest(history_row.track_ids) as requested(track_id)
      on conflict (track_id, tag_id) do nothing
      returning track_id
    )
    select count(*)::integer into changed_count from restored;
  end if;

  if changed_count <> expected_count then
    raise exception 'Track tag state changed while undoing history entry';
  end if;

  perform set_config(
    'djorganizer.skip_tag_history',
    previous_skip_history,
    true
  );

  update private.track_tag_history history
  set undone_at = clock_timestamp()
  where history.id = history_row.id;

  return jsonb_build_object(
    'history_id', history_row.id,
    'tag_id', history_row.tag_id,
    'track_ids', to_jsonb(history_row.track_ids),
    'restored_count', expected_count
  );
end;
$$;

revoke all on function public.undo_track_tag_history(uuid) from public, anon;
grant execute on function public.undo_track_tag_history(uuid) to authenticated;
