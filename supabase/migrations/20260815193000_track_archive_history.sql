create table private.track_archive_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  track_id uuid not null,
  track_title text not null,
  before_archived_at timestamptz,
  after_archived_at timestamptz,
  revision bigint generated always as identity,
  created_at timestamptz not null default clock_timestamp(),
  undone_at timestamptz,
  check ((before_archived_at is null) <> (after_archived_at is null))
);

create unique index track_archive_history_user_revision_idx
  on private.track_archive_history (user_id, revision);
create index track_archive_history_active_track_revision_idx
  on private.track_archive_history (user_id, track_id, revision desc)
  where undone_at is null;

revoke all on private.track_archive_history
  from public, anon, authenticated, service_role;

create or replace function private.record_track_archive_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('djorganizer.skip_archive_history', true), '') = '1' then
    return new;
  end if;

  if (old.archived_at is null) = (new.archived_at is null) then
    return new;
  end if;

  insert into private.track_archive_history (
    user_id,
    track_id,
    track_title,
    before_archived_at,
    after_archived_at
  )
  values (
    new.user_id,
    new.id,
    new.title,
    old.archived_at,
    new.archived_at
  );

  return new;
end;
$$;

revoke all on function private.record_track_archive_history()
  from public, anon, authenticated, service_role;

create trigger tracks_record_archive_history
after update of archived_at on public.tracks
for each row
execute function private.record_track_archive_history();

create or replace function public.list_track_archive_history(
  requested_limit integer default 10
)
returns table (
  id uuid,
  track_id uuid,
  track_title text,
  operation text,
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
    history.track_id,
    history.track_title,
    case when history.after_archived_at is null then 'restore' else 'archive' end,
    history.created_at,
    history.undone_at,
    history.undone_at is null
      and not exists (
        select 1
        from private.track_archive_history newer
        where newer.user_id = history.user_id
          and newer.track_id = history.track_id
          and newer.revision > history.revision
          and newer.undone_at is null
      )
      and exists (
        select 1
        from public.tracks track
        where track.id = history.track_id
          and track.user_id = current_user_id
          and track.archived_at is not distinct from history.after_archived_at
      ) as can_undo
  from private.track_archive_history history
  where history.user_id = current_user_id
  order by
    (
      history.undone_at is null
      and not exists (
        select 1
        from private.track_archive_history newer
        where newer.user_id = history.user_id
          and newer.track_id = history.track_id
          and newer.revision > history.revision
          and newer.undone_at is null
      )
      and exists (
        select 1
        from public.tracks track
        where track.id = history.track_id
          and track.user_id = current_user_id
          and track.archived_at is not distinct from history.after_archived_at
      )
    ) desc,
    history.revision desc
  limit safe_limit;
end;
$$;

revoke all on function public.list_track_archive_history(integer) from public, anon;
grant execute on function public.list_track_archive_history(integer) to authenticated;

create or replace function public.undo_track_archive_history(
  requested_history_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  history_row private.track_archive_history%rowtype;
  current_track public.tracks%rowtype;
  previous_skip_history text := coalesce(
    current_setting('djorganizer.skip_archive_history', true),
    ''
  );
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if requested_history_id is null then
    raise exception 'Invalid archive history entry';
  end if;

  select history.*
  into history_row
  from private.track_archive_history history
  where history.id = requested_history_id
    and history.user_id = current_user_id
  for update;

  if not found then
    raise exception 'Archive history entry not found';
  end if;
  if history_row.undone_at is not null then
    raise exception 'Archive history entry already undone';
  end if;

  select track.*
  into current_track
  from public.tracks track
  where track.id = history_row.track_id
    and track.user_id = current_user_id
  for update;

  if not found then
    raise exception 'Track not found';
  end if;

  if exists (
    select 1
    from private.track_archive_history newer
    where newer.user_id = current_user_id
      and newer.track_id = history_row.track_id
      and newer.revision > history_row.revision
      and newer.undone_at is null
  ) then
    raise exception 'Archive history entry was superseded by a later change';
  end if;

  if current_track.archived_at is distinct from history_row.after_archived_at then
    raise exception 'Track archive state changed after history entry';
  end if;

  perform set_config('djorganizer.skip_archive_history', '1', true);

  update public.tracks track
  set archived_at = history_row.before_archived_at
  where track.id = history_row.track_id
    and track.user_id = current_user_id;

  perform set_config(
    'djorganizer.skip_archive_history',
    previous_skip_history,
    true
  );

  update private.track_archive_history history
  set undone_at = clock_timestamp()
  where history.id = history_row.id;

  return jsonb_build_object(
    'history_id', history_row.id,
    'track_id', history_row.track_id,
    'restored_archived_at', history_row.before_archived_at
  );
end;
$$;

revoke all on function public.undo_track_archive_history(uuid) from public, anon;
grant execute on function public.undo_track_archive_history(uuid) to authenticated;
