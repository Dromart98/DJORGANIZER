begin;
select plan(16);

select has_column('public', 'tracks', 'subgenre', 'tracks has independent subgenre');
select col_is_nullable('public', 'tracks', 'subgenre', 'subgenre remains nullable');
select has_column('public', 'tracks', 'energy_source', 'tracks records energy provenance');
select has_column('public', 'tracks', 'energy_confidence', 'tracks records energy confidence');
select has_column('public', 'tracks', 'subgenre_source', 'tracks records subgenre provenance');
select has_column('public', 'tracks', 'subgenre_confidence', 'tracks records subgenre confidence');
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.tracks'::regclass
      and conname in (
        'tracks_energy_check',
        'tracks_energy_confidence_check',
        'tracks_subgenre_evidence_check',
        'tracks_genre_confidence_source_check'
      )
  ),
  4,
  'music analysis constraints are installed with their final names'
);
select policies_are(
  'public',
  'tracks',
  array['tracks_delete_own', 'tracks_insert_own', 'tracks_select_own', 'tracks_update_own'],
  'tracks RLS policies remain unchanged'
);

insert into auth.users (id, email)
values ('30000000-0000-4000-8000-000000000003', 'analysis-contract@djorganizer.test');

select lives_ok(
  $$
    insert into public.tracks (
      id, user_id, title, energy, energy_source, subgenre, subgenre_source
    ) values (
      '31000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003',
      'Minimum energy', 0, 'automatic', 'Deep House', 'automatic'
    )
  $$,
  'energy 0 and automatic subgenre are accepted'
);

select lives_ok(
  $$
    insert into public.tracks (
      id, user_id, title, energy, energy_source, energy_confidence
    ) values (
      '31000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000003',
      'Maximum energy', 10, 'automatic', 0.9
    )
  $$,
  'energy 10 with automatic confidence is accepted'
);

select throws_ok(
  $$insert into public.tracks (user_id, title, energy, energy_source) values ('30000000-0000-4000-8000-000000000003', 'Below range', -1, 'automatic')$$,
  '23514'::char(5),
  null,
  'energy below 0 is rejected'
);

select throws_ok(
  $$insert into public.tracks (user_id, title, energy, energy_source) values ('30000000-0000-4000-8000-000000000003', 'Above range', 11, 'automatic')$$,
  '23514'::char(5),
  null,
  'energy above 10 is rejected'
);

select throws_ok(
  $$insert into public.tracks (user_id, title, energy, energy_source, energy_confidence) values ('30000000-0000-4000-8000-000000000003', 'Manual confidence', 5, 'manual', 0.5)$$,
  '23514'::char(5),
  null,
  'manual energy cannot claim automatic confidence'
);

select throws_ok(
  $$insert into public.tracks (user_id, title, subgenre) values ('30000000-0000-4000-8000-000000000003', 'Missing subgenre source', 'Techno')$$,
  '23514'::char(5),
  null,
  'subgenre without provenance is rejected'
);

select lives_ok(
  $$insert into public.tracks (user_id, title, genre, genre_source, genre_confidence) values ('30000000-0000-4000-8000-000000000003', 'Automatic genre', 'Electronic', 'automatic', 0.8)$$,
  'automatic genre confidence is accepted'
);

select throws_ok(
  $$insert into public.tracks (user_id, title, genre, genre_source, genre_confidence) values ('30000000-0000-4000-8000-000000000003', 'Manual genre confidence', 'House', 'manual', 0.8)$$,
  '23514'::char(5),
  null,
  'manual genre confidence is rejected'
);

select * from finish();
rollback;
