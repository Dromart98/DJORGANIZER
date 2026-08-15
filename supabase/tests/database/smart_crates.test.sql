begin;

select plan(8);

insert into auth.users (id, email)
values
  ('31000000-0000-4000-8000-000000000001', 'smart-a@djorganizer.test'),
  ('32000000-0000-4000-8000-000000000002', 'smart-b@djorganizer.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.tracks (
  id, user_id, title, artist, genre, subgenre, subgenre_source, bpm, musical_key, camelot_key,
  energy, energy_source, rating, release_year
)
values
  (
    '31100000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    'Deep One', 'DJ A', 'House', 'Deep House', 'manual', 124, 'Am', '8A', 7, 'manual', 4, 2024
  ),
  (
    '31200000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    'Tech One', 'DJ B', 'Techno', 'Peak Time', 'manual', 132, 'Fm', '4A', 9, 'manual', 5, 2023
  );

insert into public.tags (id, user_id, name)
values (
  '31300000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'Peak'
);
insert into public.track_tags (user_id, track_id, tag_id)
values (
  '31000000-0000-4000-8000-000000000001',
  '31200000-0000-4000-8000-000000000001',
  '31300000-0000-4000-8000-000000000001'
);

select is(
  (
    select count(*)::integer
    from public.resolve_smart_crate_rule_tracks(
      '{"version":1,"logic":"and","groups":[{"logic":"and","conditions":[{"field":"genre","operator":"equals","value":"House"},{"field":"bpm-range","operator":"between","value":120,"value2":130}]}]}'::jsonb,
      0, 100, null
    )
  ),
  1,
  'AND rules resolve matching musical metadata'
);

select is(
  (
    select count(*)::integer
    from public.resolve_smart_crate_rule_tracks(
      '{"version":1,"logic":"or","groups":[{"logic":"and","conditions":[{"field":"genre","operator":"equals","value":"House"}]},{"logic":"and","conditions":[{"field":"energy","operator":"gte","value":9}]}]}'::jsonb,
      0, 100, null
    )
  ),
  2,
  'OR groups union matches without duplicates'
);

select is(
  (
    select track_id
    from public.resolve_smart_crate_rule_tracks(
      '{"version":1,"logic":"and","groups":[{"logic":"and","conditions":[{"field":"tag","operator":"has","value":"31300000-0000-4000-8000-000000000001"}]}]}'::jsonb,
      0, 100, null
    )
  ),
  '31200000-0000-4000-8000-000000000001'::uuid,
  'Tag rules use owned persistent tag membership'
);

update public.tracks
set genre = 'Techno'
where id = '31100000-0000-4000-8000-000000000001';

select is(
  (
    select count(*)::integer
    from public.resolve_smart_crate_rule_tracks(
      '{"version":1,"logic":"and","groups":[{"logic":"and","conditions":[{"field":"genre","operator":"equals","value":"House"}]}]}'::jsonb,
      0, 100, null
    )
  ),
  0,
  'Smart results update immediately after library metadata changes'
);

insert into public.crates (id, user_id, name, smart_rules)
values (
  '31400000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'Smart A',
  '{"version":1,"logic":"and","groups":[{"logic":"and","conditions":[{"field":"rating","operator":"gte","value":4}]}]}'::jsonb
);

select throws_ok(
  $$
    insert into public.crate_tracks (user_id, crate_id, track_id, position)
    values (
      '31000000-0000-4000-8000-000000000001',
      '31400000-0000-4000-8000-000000000001',
      '31200000-0000-4000-8000-000000000001',
      0
    )
  $$,
  'P0001',
  'smart_crate_membership_not_allowed',
  'Smart crates reject manual memberships'
);

insert into public.crates (id, user_id, name)
values (
  '31500000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'Manual A'
);
insert into public.crate_tracks (user_id, crate_id, track_id, position)
values (
  '31000000-0000-4000-8000-000000000001',
  '31500000-0000-4000-8000-000000000001',
  '31200000-0000-4000-8000-000000000001',
  0
);

select throws_ok(
  $$
    update public.crates
    set smart_rules = '{"version":1,"logic":"and","groups":[{"logic":"and","conditions":[{"field":"rating","operator":"gte","value":4}]}]}'::jsonb
    where id = '31500000-0000-4000-8000-000000000001'
  $$,
  'P0001',
  'manual_crate_has_memberships',
  'Manual crates with memberships cannot silently become smart'
);

select set_config('request.jwt.claim.sub', '32000000-0000-4000-8000-000000000002', true);
insert into public.tracks (id, user_id, title, artist, genre, bpm)
values (
  '32100000-0000-4000-8000-000000000002',
  '32000000-0000-4000-8000-000000000002',
  'Other user House', 'DJ C', 'House', 124
);

select is(
  (
    select count(*)::integer
    from public.resolve_smart_crate_rule_tracks(
      '{"version":1,"logic":"and","groups":[{"logic":"and","conditions":[{"field":"genre","operator":"equals","value":"House"}]}]}'::jsonb,
      0, 100, null
    )
  ),
  1,
  'Resolver is scoped by authenticated user'
);

select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);
select is(
  (
    select count(*)::integer
    from public.resolve_smart_crate_rule_tracks(
      '{"version":1,"logic":"and","groups":[{"logic":"and","conditions":[{"field":"genre","operator":"contains","value":"tech"}]}]}'::jsonb,
      0, 1, null
    )
  ),
  1,
  'Resolver pagination returns a single page row without duplicating tracks'
);

select * from finish();
rollback;
