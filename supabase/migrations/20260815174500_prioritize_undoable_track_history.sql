create or replace function public.list_track_edit_history(
  requested_track_id uuid,
  requested_limit integer default 20
)
returns table (
  id uuid,
  changed_fields text[],
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
  current_track public.tracks%rowtype;
  current_snapshot jsonb;
  safe_limit integer := greatest(1, least(coalesce(requested_limit, 20), 50));
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select t.*
  into current_track
  from public.tracks t
  where t.id = requested_track_id
    and t.user_id = current_user_id;

  if not found then
    raise exception 'Track not found';
  end if;

  current_snapshot := private.track_edit_snapshot(current_track);

  return query
  select
    h.id,
    h.changed_fields,
    h.created_at,
    h.undone_at,
    h.undone_at is null and h.after_state = current_snapshot as can_undo
  from public.track_edit_history h
  where h.user_id = current_user_id
    and h.track_id = requested_track_id
  order by
    (h.undone_at is null and h.after_state = current_snapshot) desc,
    h.created_at desc,
    h.id desc
  limit safe_limit;
end;
$$;
