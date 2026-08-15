begin;

select plan(4);

insert into auth.users (id, email)
values
  ('51000000-0000-4000-8000-000000000001', 'sort-a@djorganizer.test'),
  ('52000000-0000-4000-8000-000000000002', 'sort-b@djorganizer.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.tracks (id, user_id, title, bpm)
values
  ('51100000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'One', 128),
  ('51100000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', 'Two', 124),
  ('51100000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000001', 'Three', 132);

insert into public.crates (id, user_id, name)
values (
  '51200000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  'Sortable'
);

insert into public.crate_tracks (user_id, crate_id, track_id, position)
values
  ('51000000-0000-4000-8000-000000000001', '51200000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000001', 0),
  ('51000000-0000-4000-8000-000000000001', '51200000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000002', 1),
  ('51000000-0000-4000-8000-000000000001', '51200000-0000-4000-8000-000000000001', '51100000-0000-4000-8000-000000000003', 2);

select lives_ok(
  $$select public.apply_manual_crate_order(
    '51200000-0000-4000-8000-000000000001'::uuid,
    array[
      '51100000-0000-4000-8000-000000000001'::uuid,
      '51100000-0000-4000-8000-000000000002'::uuid,
      '51100000-0000-4000-8000-000000000003'::uuid
    ],
    array[
      '51100000-0000-4000-8000-000000000003'::uuid,
      '51100000-0000-4000-8000-000000000001'::uuid,
      '51100000-0000-4000-8000-000000000002'::uuid
    ]
  )$$,
  'A reviewed order is applied atomically'
);

select is(
  (
    select array_agg(track_id order by position, created_at, track_id)
    from public.crate_tracks
    where crate_id = '51200000-0000-4000-8000-000000000001'
  ),
  array[
    '51100000-0000-4000-8000-000000000003'::uuid,
    '51100000-0000-4000-8000-000000000001'::uuid,
    '51100000-0000-4000-8000-000000000002'::uuid
  ],
  'The exact previewed order becomes the persisted crate order'
);

select public.move_track_in_manual_crate(
  '51200000-0000-4000-8000-000000000001'::uuid,
  '51100000-0000-4000-8000-000000000003'::uuid,
  'down'
);

select throws_ok(
  $$select public.apply_manual_crate_order(
    '51200000-0000-4000-8000-000000000001'::uuid,
    array[
      '51100000-0000-4000-8000-000000000003'::uuid,
      '51100000-0000-4000-8000-000000000001'::uuid,
      '51100000-0000-4000-8000-000000000002'::uuid
    ],
    array[
      '51100000-0000-4000-8000-000000000002'::uuid,
      '51100000-0000-4000-8000-000000000001'::uuid,
      '51100000-0000-4000-8000-000000000003'::uuid
    ]
  )$$,
  'P0001',
  'Crate changed after preview',
  'A stale preview cannot overwrite a newer manual order'
);

select set_config('request.jwt.claim.sub', '52000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.apply_manual_crate_order(
    '51200000-0000-4000-8000-000000000001'::uuid,
    array[]::uuid[],
    array[]::uuid[]
  )$$,
  'P0001',
  'Manual crate not found',
  'A user cannot reorder another owner''s crate'
);

select * from finish();
rollback;
