create or replace function public.create_crate_from_library_filters(
  crate_name text,
  search_term text,
  genre_filter text,
  subgenre_filter text,
  bpm_min double precision,
  bpm_max double precision,
  key_filter text,
  camelot_filter text,
  energy_min integer,
  energy_max integer,
  rating_min integer,
  sort_key text,
  sort_direction text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  normalized_name text := trim(crate_name);
  new_crate_id uuid;
  inserted_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if normalized_name is null
    or char_length(normalized_name) < 1
    or char_length(normalized_name) > 120 then
    raise exception 'Invalid crate name';
  end if;

  if sort_key not in ('artist', 'bpm', 'created', 'duration', 'key', 'title', 'subgenre')
    or sort_direction not in ('asc', 'desc') then
    raise exception 'Invalid library order';
  end if;

  if nullif(search_term, '') is null
    and genre_filter is null
    and subgenre_filter is null
    and bpm_min is null
    and bpm_max is null
    and key_filter is null
    and camelot_filter is null
    and energy_min is null
    and energy_max is null
    and rating_min is null then
    raise exception 'At least one library filter is required';
  end if;

  insert into public.crates (user_id, name, description)
  values (current_user_id, normalized_name, null)
  returning id into new_crate_id;

  with filtered as (
    select
      tracks.id,
      row_number() over (
        order by
          case when sort_key = 'artist' and sort_direction = 'asc' then tracks.artist end asc nulls last,
          case when sort_key = 'artist' and sort_direction = 'desc' then tracks.artist end desc nulls last,
          case when sort_key = 'bpm' and sort_direction = 'asc' then tracks.bpm end asc nulls last,
          case when sort_key = 'bpm' and sort_direction = 'desc' then tracks.bpm end desc nulls last,
          case when sort_key = 'created' and sort_direction = 'asc' then tracks.created_at end asc nulls last,
          case when sort_key = 'created' and sort_direction = 'desc' then tracks.created_at end desc nulls last,
          case when sort_key = 'duration' and sort_direction = 'asc' then tracks.duration_seconds end asc nulls last,
          case when sort_key = 'duration' and sort_direction = 'desc' then tracks.duration_seconds end desc nulls last,
          case when sort_key = 'key' and sort_direction = 'asc' then tracks.musical_key end asc nulls last,
          case when sort_key = 'key' and sort_direction = 'desc' then tracks.musical_key end desc nulls last,
          case when sort_key = 'title' and sort_direction = 'asc' then tracks.title end asc nulls last,
          case when sort_key = 'title' and sort_direction = 'desc' then tracks.title end desc nulls last,
          case when sort_key = 'subgenre' and sort_direction = 'asc' then tracks.subgenre end asc nulls last,
          case when sort_key = 'subgenre' and sort_direction = 'desc' then tracks.subgenre end desc nulls last,
          tracks.id asc
      )::integer - 1 as position
    from public.tracks
    where tracks.user_id = current_user_id
      and (
        nullif(search_term, '') is null
        or tracks.title ilike ('%' || search_term || '%')
        or tracks.artist ilike ('%' || search_term || '%')
        or tracks.album ilike ('%' || search_term || '%')
        or tracks.genre ilike ('%' || search_term || '%')
        or tracks.subgenre ilike ('%' || search_term || '%')
      )
      and (genre_filter is null or tracks.genre ilike genre_filter)
      and (subgenre_filter is null or tracks.subgenre ilike subgenre_filter)
      and (bpm_min is null or tracks.bpm >= bpm_min)
      and (bpm_max is null or tracks.bpm <= bpm_max)
      and (key_filter is null or tracks.musical_key ilike key_filter)
      and (camelot_filter is null or tracks.camelot_key = upper(camelot_filter))
      and (energy_min is null or tracks.energy >= energy_min)
      and (energy_max is null or tracks.energy <= energy_max)
      and (rating_min is null or tracks.rating >= rating_min)
  )
  insert into public.crate_tracks (user_id, crate_id, track_id, position)
  select current_user_id, new_crate_id, filtered.id, filtered.position
  from filtered
  order by filtered.position;

  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    raise exception 'The active filters no longer return tracks';
  end if;

  return new_crate_id;
end;
$$;

revoke all on function public.create_crate_from_library_filters(
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text,
  text,
  integer,
  integer,
  integer,
  text,
  text
) from public, anon;
grant execute on function public.create_crate_from_library_filters(
  text,
  text,
  text,
  text,
  double precision,
  double precision,
  text,
  text,
  integer,
  integer,
  integer,
  text,
  text
) to authenticated;
