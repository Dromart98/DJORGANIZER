begin;

select plan(5);

insert into auth.users (id, email)
values
  ('41000000-0000-4000-8000-000000000001', 'merge-a@djorganizer.test'),
  ('42000000-0000-4000-8000-000000000002', 'merge-b@djorganizer.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.tracks (id, user_id, title)
values
  ('41100000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'Target one'),
  ('41100000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000001', 'Common'),
  ('41100000-0000-4000-8000-000000000003', '41000000-0000-4000-8000-000000000001', 'Source only'),
  ('41100000-0000-4000-8000-000000000004', '41000000-0000-4000-8000-000000000001', 'Late source');

insert into public.crates (id, user_id, name)
values
  ('41200000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'Source'),
  ('41200000-0000-4000-8000-000000000002', '41000000-0000-4000-8000-000000000001', 'Target');

insert into public.crate_tracks (user_id, crate_id, track_id, position)
values
  ('41000000-0000-4000-8000-000000000001', '41200000-0000-4000-8000-000000000001', '41100000-0000-4000-8000-000000000002', 0),
  ('41000000-0000-4000-8000-000000000001', '41200000-0000-4000-8000-000000000001', '41100000-0000-4000-8000-000000000003', 1),
  ('41000000-0000-4000-8000-000000000001', '41200000-0000-4000-8000-000000000002', '41100000-0000-4000-8000-000000000001', 0),
  ('41000000-0000-4000-8000-000000000001', '41200000-0000-4000-8000-000000000002', '41100000-0000-4000-8000-000000000002', 1);

select lives_ok(
  $$select public.merge_manual_crates(
    '41200000-0000-4000-8000-000000000001'::uuid,
    '41200000-0000-4000-8000-000000000002'::uuid,
    array[
      '41100000-0000-4000-8000-000000000002'::uuid,
      '41100000-0000-4000-8000-000000000003'::uuid
    ],
    array[
      '41100000-0000-4000-8000-000000000001'::uuid,
      '41100000-0000-4000-8000-000000000002'::uuid
    ]
  )$$,
  'Manual crates merge atomically from the reviewed snapshots'
);

select is(
  (
    select array_agg(track_id order by position, created_at, track_id)
    from public.crate_tracks
    where crate_id = '41200000-0000-4000-8000-000000000002'
  ),
  array[
    '41100000-0000-4000-8000-000000000001'::uuid,
    '41100000-0000-4000-8000-000000000002'::uuid,
    '41100000-0000-4000-8000-000000000003'::uuid
  ],
  'Target order is preserved and source-only tracks are appended'
);

select is(
  (
    select array_agg(track_id order by position, created_at, track_id)
    from public.crate_tracks
    where crate_id = '41200000-0000-4000-8000-000000000001'
  ),
  array[
    '41100000-0000-4000-8000-000000000002'::uuid,
    '41100000-0000-4000-8000-000000000003'::uuid
  ],
  'Source crate remains unchanged'
);

insert into public.crate_tracks (user_id, crate_id, track_id, position)
values (
  '41000000-0000-4000-8000-000000000001',
  '41200000-0000-4000-8000-000000000001',
  '41100000-0000-4000-8000-000000000004',
  2
);

select throws_ok(
  $$select public.merge_manual_crates(
    '41200000-0000-4000-8000-000000000001'::uuid,
    '41200000-0000-4000-8000-000000000002'::uuid,
    array[
      '41100000-0000-4000-8000-000000000002'::uuid,
      '41100000-0000-4000-8000-000000000003'::uuid
    ],
    array[
      '41100000-0000-4000-8000-000000000001'::uuid,
      '41100000-0000-4000-8000-000000000002'::uuid,
      '41100000-0000-4000-8000-000000000003'::uuid
    ]
  )$$,
  'P0001',
  'Crate changed after preview',
  'A stale preview is rejected before mutating the target'
);

select set_config('request.jwt.claim.sub', '42000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select public.merge_manual_crates(
    '41200000-0000-4000-8000-000000000001'::uuid,
    '41200000-0000-4000-8000-000000000002'::uuid,
    array[]::uuid[],
    array[]::uuid[]
  )$$,
  'P0001',
  'Manual crate not found',
  'A user cannot merge another library owner''s crates'
);

select * from finish();
rollback;
