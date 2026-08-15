create or replace function public.compare_crates(
  p_left_crate_id uuid,
  p_right_crate_id uuid,
  p_limit_per_relation integer default 200
)
returns table (
  track_id uuid,
  relation text,
  relation_count bigint,
  relation_order bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with selected_crates as (
    select c.id, c.smart_rules
    from public.crates c
    where c.user_id = (select auth.uid())
      and c.id in (p_left_crate_id, p_right_crate_id)
      and p_left_crate_id <> p_right_crate_id
  ),
  manual_memberships as (
    select
      ct.crate_id,
      ct.track_id,
      row_number() over (
        partition by ct.crate_id
        order by ct.position asc, ct.created_at asc, ct.track_id asc
      ) as ordinal
    from public.crate_tracks ct
    join selected_crates c on c.id = ct.crate_id
    where c.smart_rules is null
      and ct.user_id = (select auth.uid())
  ),
  smart_memberships as (
    select
      c.id as crate_id,
      t.id as track_id,
      row_number() over (
        partition by c.id
        order by lower(coalesce(t.title, '')), lower(coalesce(t.artist, '')), t.id
      ) as ordinal
    from selected_crates c
    cross join public.tracks t
    where c.smart_rules is not null
      and t.user_id = (select auth.uid())
      and case coalesce(c.smart_rules ->> 'trackStatus', 'active')
        when 'active' then t.archived_at is null
        when 'archived' then t.archived_at is not null
        when 'all' then true
        else false
      end
      and jsonb_typeof(c.smart_rules) = 'object'
      and c.smart_rules ->> 'version' = '1'
      and c.smart_rules ->> 'logic' in ('and', 'or')
      and jsonb_typeof(c.smart_rules -> 'groups') = 'array'
      and jsonb_array_length(c.smart_rules -> 'groups') between 1 and 4
      and coalesce((
        select case c.smart_rules ->> 'logic'
          when 'and' then bool_and(group_result.matches)
          when 'or' then bool_or(group_result.matches)
          else false
        end
        from jsonb_array_elements(c.smart_rules -> 'groups') as group_item(value)
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
  ),
  memberships as (
    select * from manual_memberships
    union all
    select * from smart_memberships
  ),
  left_memberships as (
    select m.track_id, m.ordinal
    from memberships m
    where m.crate_id = p_left_crate_id
  ),
  right_memberships as (
    select m.track_id, m.ordinal
    from memberships m
    where m.crate_id = p_right_crate_id
  ),
  classified as (
    select
      coalesce(l.track_id, r.track_id) as track_id,
      case
        when l.track_id is not null and r.track_id is not null then 'common'
        when l.track_id is not null then 'left_only'
        else 'right_only'
      end as relation,
      case
        when l.track_id is not null then l.ordinal
        else r.ordinal
      end as source_order
    from left_memberships l
    full join right_memberships r on r.track_id = l.track_id
  ),
  ranked as (
    select
      c.track_id,
      c.relation,
      count(*) over (partition by c.relation) as relation_count,
      row_number() over (
        partition by c.relation
        order by c.source_order asc, c.track_id asc
      ) as relation_order
    from classified c
  )
  select r.track_id, r.relation, r.relation_count, r.relation_order
  from ranked r
  where r.relation_order <= least(greatest(coalesce(p_limit_per_relation, 200), 1), 500)
  order by
    case r.relation when 'common' then 1 when 'left_only' then 2 else 3 end,
    r.relation_order;
$$;

revoke all on function public.compare_crates(uuid, uuid, integer) from public, anon;
grant execute on function public.compare_crates(uuid, uuid, integer) to authenticated;
