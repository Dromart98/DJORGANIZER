alter table public.tracks
  add column archived_at timestamptz;

comment on column public.tracks.archived_at is
  'Archive marker for inactive tracks. Null means active; archiving never deletes or moves the source file.';

create index tracks_user_active_created_at_idx
  on public.tracks (user_id, created_at desc)
  where archived_at is null;

create index tracks_user_archived_at_idx
  on public.tracks (user_id, archived_at desc)
  where archived_at is not null;

create or replace function public.resolve_smart_crate_rule_tracks(
  p_rules jsonb,
  p_offset integer default 0,
  p_limit integer default 100,
  p_search text default null
)
returns table (
  track_id uuid,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with matching as (
    select t.id, t.title, t.artist
    from public.tracks t
    where t.user_id = (select auth.uid())
      and t.archived_at is null
      and jsonb_typeof(p_rules) = 'object'
      and p_rules ->> 'version' = '1'
      and p_rules ->> 'logic' in ('and', 'or')
      and jsonb_typeof(p_rules -> 'groups') = 'array'
      and jsonb_array_length(p_rules -> 'groups') between 1 and 4
      and coalesce((
        select case p_rules ->> 'logic'
          when 'and' then bool_and(group_result.matches)
          when 'or' then bool_or(group_result.matches)
          else false
        end
        from jsonb_array_elements(p_rules -> 'groups') as group_item(value)
        cross join lateral (
          select case group_item.value ->> 'logic'
            when 'and' then coalesce(bool_and(condition_result.matches), false)
            when 'or' then coalesce(bool_or(condition_result.matches), false)
            else false
          end as matches
          from jsonb_array_elements(
            case
              when jsonb_typeof(group_item.value -> 'conditions') = 'array'
                then group_item.value -> 'conditions'
              else '[]'::jsonb
            end
          ) as condition_item(value)
          cross join lateral (
            select case condition_item.value ->> 'field'
              when 'title' then case condition_item.value ->> 'operator'
                when 'equals' then lower(coalesce(t.title, '')) = lower(coalesce(condition_item.value ->> 'value', ''))
                when 'contains' then position(lower(coalesce(condition_item.value ->> 'value', '')) in lower(coalesce(t.title, ''))) > 0
                else false end
              when 'artist' then case condition_item.value ->> 'operator'
                when 'equals' then lower(coalesce(t.artist, '')) = lower(coalesce(condition_item.value ->> 'value', ''))
                when 'contains' then position(lower(coalesce(condition_item.value ->> 'value', '')) in lower(coalesce(t.artist, ''))) > 0
                else false end
              when 'album' then case condition_item.value ->> 'operator'
                when 'equals' then lower(coalesce(t.album, '')) = lower(coalesce(condition_item.value ->> 'value', ''))
                when 'contains' then position(lower(coalesce(condition_item.value ->> 'value', '')) in lower(coalesce(t.album, ''))) > 0
                else false end
              when 'genre' then case condition_item.value ->> 'operator'
                when 'equals' then lower(coalesce(t.genre, '')) = lower(coalesce(condition_item.value ->> 'value', ''))
                when 'contains' then position(lower(coalesce(condition_item.value ->> 'value', '')) in lower(coalesce(t.genre, ''))) > 0
                else false end
              when 'subgenre' then case condition_item.value ->> 'operator'
                when 'equals' then lower(coalesce(t.subgenre, '')) = lower(coalesce(condition_item.value ->> 'value', ''))
                when 'contains' then position(lower(coalesce(condition_item.value ->> 'value', '')) in lower(coalesce(t.subgenre, ''))) > 0
                else false end
              when 'key' then
                condition_item.value ->> 'operator' = 'equals'
                and lower(coalesce(t.musical_key, '')) = lower(coalesce(condition_item.value ->> 'value', ''))
              when 'camelot' then
                condition_item.value ->> 'operator' = 'equals'
                and upper(coalesce(t.camelot_key, '')) = upper(coalesce(condition_item.value ->> 'value', ''))
              when 'tag' then case
                when condition_item.value ->> 'operator' = 'has'
                  and coalesce(condition_item.value ->> 'value', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then exists (
                  select 1
                  from public.track_tags tt
                  where tt.user_id = t.user_id
                    and tt.track_id = t.id
                    and tt.tag_id = (condition_item.value ->> 'value')::uuid
                )
                else false end
              when 'bpm' then case
                when coalesce(condition_item.value ->> 'value', '') !~ '^[0-9]+(?:\.[0-9]+)?$' then false
                when condition_item.value ->> 'operator' = 'eq' then t.bpm = (condition_item.value ->> 'value')::numeric
                when condition_item.value ->> 'operator' = 'gte' then t.bpm >= (condition_item.value ->> 'value')::numeric
                when condition_item.value ->> 'operator' = 'lte' then t.bpm <= (condition_item.value ->> 'value')::numeric
                when condition_item.value ->> 'operator' = 'between'
                  and coalesce(condition_item.value ->> 'value2', '') ~ '^[0-9]+(?:\.[0-9]+)?$'
                  then t.bpm between (condition_item.value ->> 'value')::numeric and (condition_item.value ->> 'value2')::numeric
                else false end
              when 'bpm-range' then case
                when condition_item.value ->> 'operator' = 'between'
                  and coalesce(condition_item.value ->> 'value', '') ~ '^[0-9]+(?:\.[0-9]+)?$'
                  and coalesce(condition_item.value ->> 'value2', '') ~ '^[0-9]+(?:\.[0-9]+)?$'
                  then t.bpm between (condition_item.value ->> 'value')::numeric and (condition_item.value ->> 'value2')::numeric
                else false end
              when 'energy' then case
                when coalesce(condition_item.value ->> 'value', '') !~ '^[0-9]+(?:\.[0-9]+)?$' then false
                when condition_item.value ->> 'operator' = 'eq' then t.energy = (condition_item.value ->> 'value')::numeric
                when condition_item.value ->> 'operator' = 'gte' then t.energy >= (condition_item.value ->> 'value')::numeric
                when condition_item.value ->> 'operator' = 'lte' then t.energy <= (condition_item.value ->> 'value')::numeric
                when condition_item.value ->> 'operator' = 'between'
                  and coalesce(condition_item.value ->> 'value2', '') ~ '^[0-9]+(?:\.[0-9]+)?$'
                  then t.energy between (condition_item.value ->> 'value')::numeric and (condition_item.value ->> 'value2')::numeric
                else false end
              when 'rating' then case
                when coalesce(condition_item.value ->> 'value', '') !~ '^[0-9]+(?:\.[0-9]+)?$' then false
                when condition_item.value ->> 'operator' = 'eq' then t.rating = (condition_item.value ->> 'value')::numeric
                when condition_item.value ->> 'operator' = 'gte' then t.rating >= (condition_item.value ->> 'value')::numeric
                when condition_item.value ->> 'operator' = 'lte' then t.rating <= (condition_item.value ->> 'value')::numeric
                when condition_item.value ->> 'operator' = 'between'
                  and coalesce(condition_item.value ->> 'value2', '') ~ '^[0-9]+(?:\.[0-9]+)?$'
                  then t.rating between (condition_item.value ->> 'value')::numeric and (condition_item.value ->> 'value2')::numeric
                else false end
              when 'year' then case
                when coalesce(condition_item.value ->> 'value', '') !~ '^[0-9]+$' then false
                when condition_item.value ->> 'operator' = 'eq' then t.release_year = (condition_item.value ->> 'value')::smallint
                when condition_item.value ->> 'operator' = 'gte' then t.release_year >= (condition_item.value ->> 'value')::smallint
                when condition_item.value ->> 'operator' = 'lte' then t.release_year <= (condition_item.value ->> 'value')::smallint
                when condition_item.value ->> 'operator' = 'between'
                  and coalesce(condition_item.value ->> 'value2', '') ~ '^[0-9]+$'
                  then t.release_year between (condition_item.value ->> 'value')::smallint and (condition_item.value ->> 'value2')::smallint
                else false end
              else false
            end as matches
          ) as condition_result
        ) as group_result
      ), false)
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or position(lower(trim(p_search)) in lower(coalesce(t.title, ''))) > 0
        or position(lower(trim(p_search)) in lower(coalesce(t.artist, ''))) > 0
      )
  ),
  ordered as (
    select
      matching.id,
      count(*) over () as total_count,
      row_number() over (
        order by lower(coalesce(matching.title, '')), lower(coalesce(matching.artist, '')), matching.id
      ) as row_number
    from matching
  )
  select ordered.id, ordered.total_count
  from ordered
  where ordered.row_number > greatest(coalesce(p_offset, 0), 0)
    and ordered.row_number <= greatest(coalesce(p_offset, 0), 0) + least(greatest(coalesce(p_limit, 100), 1), 500)
  order by ordered.row_number;
$$;

revoke all on function public.resolve_smart_crate_rule_tracks(jsonb, integer, integer, text)
  from public, anon;
grant execute on function public.resolve_smart_crate_rule_tracks(jsonb, integer, integer, text)
  to authenticated;
