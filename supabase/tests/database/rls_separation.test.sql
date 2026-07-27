begin;

select plan(41);

select is(
  (
    select count(*)::integer
    from pg_class as tables
    join pg_namespace as schemas on schemas.oid = tables.relnamespace
    where schemas.nspname = 'public'
      and tables.relname in (
        'profiles',
        'tracks',
        'tags',
        'track_tags',
        'crates',
        'crate_tracks',
        'integration_syncs',
        'ai_analysis_events'
      )
      and tables.relrowsecurity
  ),
  8,
  'RLS is enabled on every personal table'
);

select is(
  (
    select count(distinct tablename)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'tracks',
        'tags',
        'track_tags',
        'crates',
        'crate_tracks',
        'integration_syncs',
        'ai_analysis_events'
      )
  ),
  8,
  'Every personal table has at least one access policy'
);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'rls-a@djorganizer.test'),
  ('20000000-0000-4000-8000-000000000002', 'rls-b@djorganizer.test');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.tracks (id, user_id, title, artist, bpm, musical_key)
values (
  '11000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'RLS test A',
  null,
  128,
  'Am'
);

insert into public.tags (id, user_id, name)
values (
  '12000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Peak time A'
);

insert into public.track_tags (user_id, track_id, tag_id)
values (
  '10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001'
);

insert into public.crates (id, user_id, name)
values (
  '13000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'RLS crate A'
);

insert into public.crate_tracks (user_id, crate_id, track_id, position)
values (
  '10000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  0
);

insert into public.integration_syncs (
  id,
  user_id,
  provider,
  list_name,
  direction,
  track_ids
)
values (
  '14000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'virtualdj',
  'RLS List A',
  'export',
  array['11000000-0000-4000-8000-000000000001'::uuid]
);

insert into public.ai_analysis_events (id, user_id, analysis_kind)
values (
  '15000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'genre'
);

select is((select count(*)::integer from public.profiles), 1, 'A sees only its profile');
select is((select count(*)::integer from public.tracks), 1, 'A sees only its track');
select is((select count(*)::integer from public.tags), 1, 'A sees only its tag');
select is((select count(*)::integer from public.track_tags), 1, 'A sees only its track tag');
select is((select count(*)::integer from public.crates), 1, 'A sees only its crate');
select is((select count(*)::integer from public.crate_tracks), 1, 'A sees only its crate track');
select is((select count(*)::integer from public.integration_syncs), 1, 'A sees only its sync');
select is((select count(*)::integer from public.ai_analysis_events), 1, 'A sees only its AI event');

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);

select is((select count(*)::integer from public.profiles), 1, 'B cannot see the A profile');
select is((select count(*)::integer from public.tracks), 0, 'B cannot see A tracks');
select is((select count(*)::integer from public.tags), 0, 'B cannot see A tags');
select is((select count(*)::integer from public.track_tags), 0, 'B cannot see A track tags');
select is((select count(*)::integer from public.crates), 0, 'B cannot see A crates');
select is((select count(*)::integer from public.crate_tracks), 0, 'B cannot see A crate tracks');
select is((select count(*)::integer from public.integration_syncs), 0, 'B cannot see A syncs');
select is((select count(*)::integer from public.ai_analysis_events), 0, 'B cannot see A AI events');

insert into public.tracks (id, user_id, title, artist, bpm, musical_key)
values (
  '21000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'RLS test B',
  null,
  124,
  'C'
);

insert into public.tags (id, user_id, name)
values (
  '22000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'Warm up B'
);

insert into public.track_tags (user_id, track_id, tag_id)
values (
  '20000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000002',
  '22000000-0000-4000-8000-000000000002'
);

insert into public.crates (id, user_id, name)
values (
  '23000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'RLS crate B'
);

insert into public.crate_tracks (user_id, crate_id, track_id, position)
values (
  '20000000-0000-4000-8000-000000000002',
  '23000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000002',
  0
);

insert into public.integration_syncs (
  id,
  user_id,
  provider,
  list_name,
  direction,
  track_ids
)
values (
  '24000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'virtualdj',
  'RLS List B',
  'import',
  array['21000000-0000-4000-8000-000000000002'::uuid]
);

insert into public.ai_analysis_events (id, user_id, analysis_kind)
values (
  '25000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  'genre'
);

select is((select count(*)::integer from public.profiles), 1, 'B sees only its profile');
select is((select count(*)::integer from public.tracks), 1, 'B sees only its track');
select is((select count(*)::integer from public.tags), 1, 'B sees only its tag');
select is((select count(*)::integer from public.track_tags), 1, 'B sees only its track tag');
select is((select count(*)::integer from public.crates), 1, 'B sees only its crate');
select is((select count(*)::integer from public.crate_tracks), 1, 'B sees only its crate track');
select is((select count(*)::integer from public.integration_syncs), 1, 'B sees only its sync');
select is((select count(*)::integer from public.ai_analysis_events), 1, 'B sees only its AI event');

select throws_like(
  $$
    insert into public.track_tags (user_id, track_id, tag_id)
    values (
      '20000000-0000-4000-8000-000000000002',
      '21000000-0000-4000-8000-000000000002',
      '12000000-0000-4000-8000-000000000001'
    )
  $$,
  '%violates foreign key constraint%',
  'B cannot associate its track with an A tag'
);

with deleted as (
  delete from public.track_tags
  where track_id = '11000000-0000-4000-8000-000000000001'
  returning 1
)
select is(count(*)::integer, 0, 'B cannot remove an A track tag') from deleted;

insert into public.tracks (id, user_id, title)
values (
  '21000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000002',
  'RLS test B second track'
);
insert into public.track_tags (user_id, track_id, tag_id)
values (
  '20000000-0000-4000-8000-000000000002',
  '21000000-0000-4000-8000-000000000003',
  '22000000-0000-4000-8000-000000000002'
);
delete from public.track_tags
where track_id = '21000000-0000-4000-8000-000000000002'
  and tag_id = '22000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.tags where id = '22000000-0000-4000-8000-000000000002'), 1, 'Removing a relation preserves its reusable tag');
select is((select count(*)::integer from public.track_tags where track_id = '21000000-0000-4000-8000-000000000003'), 1, 'Removing one relation preserves the other track relation');
select is((select count(*)::integer from public.track_tags where track_id = '21000000-0000-4000-8000-000000000002'), 0, 'Only the selected track relation is removed');
select is((select count(*)::integer from public.tags), 1, 'The reusable tag catalog remains isolated and intact');

select ok(
  (
    select artist is null
    from public.tracks
    where id = '21000000-0000-4000-8000-000000000002'
  ),
  'A track can be stored with no artist'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.tracks'::regclass
      and conname in (
        'tracks_bpm_analysis_requires_value',
        'tracks_key_analysis_requires_value',
        'tracks_bpm_confidence_is_local',
        'tracks_key_confidence_is_local'
      )
  ),
  4,
  'Analysis provenance constraints are installed'
);

update public.tracks
set
  bpm_source = 'local',
  bpm_confidence = 0.875,
  bpm_explanation = 'Three local windows agree.'
where id = '21000000-0000-4000-8000-000000000002';

select is(
  (
    select bpm_confidence
    from public.tracks
    where id = '21000000-0000-4000-8000-000000000002'
  ),
  0.875::numeric,
  'A local BPM confidence value is stored'
);

with changed as (
  update public.tracks
  set title = 'Illicit update'
  where id = '11000000-0000-4000-8000-000000000001'
  returning 1
)
select is(
  count(*)::integer,
  0,
  'B cannot update an A track'
) from changed;

with deleted as (
  delete from public.tracks
  where id = '11000000-0000-4000-8000-000000000001'
  returning 1
)
select is(
  count(*)::integer,
  0,
  'B cannot delete an A track'
) from deleted;

with changed as (
  update public.tags
  set name = 'Illicit tag update'
  where id = '12000000-0000-4000-8000-000000000001'
  returning 1
)
select is(
  count(*)::integer,
  0,
  'B cannot update an A tag'
) from changed;

with deleted as (
  delete from public.crates
  where id = '13000000-0000-4000-8000-000000000001'
  returning 1
)
select is(
  count(*)::integer,
  0,
  'B cannot delete an A crate'
) from deleted;

select throws_ok(
  $$
    select public.reconcile_crate_tracks(
      '13000000-0000-4000-8000-000000000001',
      array['21000000-0000-4000-8000-000000000002'::uuid],
      false
    )
  $$,
  'P0001',
  'Crate not found',
  'B cannot reconcile an A crate'
);

select ok(
  not has_table_privilege('anon', 'public.tracks', 'select'),
  'Anonymous clients cannot read tracks'
);

select * from finish();
rollback;
