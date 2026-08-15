begin;

select plan(21);

insert into auth.users (id, email)
values
  ('91000000-0000-4000-8000-000000000001', 'crate-history-a@djorganizer.test'),
  ('92000000-0000-4000-8000-000000000002', 'crate-history-b@djorganizer.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.tracks (id, user_id, title, artist)
values
  ('91100000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'One', 'Artist'),
  ('91100000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'Two', 'Artist'),
  ('91100000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'Three', 'Artist'),
  ('91100000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000001', 'Four', 'Artist');

insert into public.crates (id, user_id, name)
values
  ('91200000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'Add remove'),
  ('91200000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', 'Order'),
  ('91200000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', 'Merge target'),
  ('91200000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000001', 'Merge source'),
  ('91200000-0000-4000-8000-000000000005', '91000000-0000-4000-8000-000000000001', 'Reconcile');

select is(
  public.add_track_to_manual_crate(
    '91200000-0000-4000-8000-000000000001',
    '91100000-0000-4000-8000-000000000001'
  ),
  0,
  'Add returns the appended zero-based position'
);

select is(
  (
    select change_kind
    from public.list_manual_crate_history('91200000-0000-4000-8000-000000000001', 10)
    limit 1
  ),
  'add',
  'Add records crate history'
);

select ok(
  (
    select can_undo
    from public.list_manual_crate_history('91200000-0000-4000-8000-000000000001', 10)
    limit 1
  ),
  'Latest add is undoable'
);

select lives_ok(
  $$select public.undo_manual_crate_history(
    (select id from public.list_manual_crate_history(
      '91200000-0000-4000-8000-000000000001'::uuid, 10
    ) where can_undo limit 1)
  )$$,
  'Add can be undone'
);

select is(
  private.manual_crate_order(
    '91200000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001'
  ),
  array[]::uuid[],
  'Undo add restores the empty crate'
);

insert into public.crate_tracks (user_id, crate_id, track_id, position)
values
  ('91000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000001', '91100000-0000-4000-8000-000000000001', 0),
  ('91000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000001', '91100000-0000-4000-8000-000000000002', 1);

select lives_ok(
  $$select public.remove_track_from_manual_crate(
    '91200000-0000-4000-8000-000000000001'::uuid,
    '91100000-0000-4000-8000-000000000001'::uuid
  )$$,
  'Remove uses the atomic manual-crate RPC'
);

select is(
  (
    select change_kind
    from public.list_manual_crate_history('91200000-0000-4000-8000-000000000001', 10)
    where undone_at is null
    limit 1
  ),
  'remove',
  'Remove records crate history'
);

select lives_ok(
  $$select public.undo_manual_crate_history(
    (select id from public.list_manual_crate_history(
      '91200000-0000-4000-8000-000000000001'::uuid, 10
    ) where can_undo limit 1)
  )$$,
  'Remove can be undone'
);

select is(
  private.manual_crate_order(
    '91200000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001'
  ),
  array[
    '91100000-0000-4000-8000-000000000001'::uuid,
    '91100000-0000-4000-8000-000000000002'::uuid
  ],
  'Undo remove restores exact membership and order'
);

insert into public.crate_tracks (user_id, crate_id, track_id, position)
values
  ('91000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000002', '91100000-0000-4000-8000-000000000001', 0),
  ('91000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000002', '91100000-0000-4000-8000-000000000002', 1),
  ('91000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000002', '91100000-0000-4000-8000-000000000003', 2);

select ok(
  public.move_track_in_manual_crate(
    '91200000-0000-4000-8000-000000000002',
    '91100000-0000-4000-8000-000000000002',
    'up'
  ),
  'Move changes a valid adjacent order'
);

select is(
  (
    select change_kind
    from public.list_manual_crate_history('91200000-0000-4000-8000-000000000002', 10)
    where can_undo
    limit 1
  ),
  'move',
  'Move records one undoable history entry'
);

select ok(
  public.apply_manual_crate_order(
    '91200000-0000-4000-8000-000000000002',
    array[
      '91100000-0000-4000-8000-000000000002'::uuid,
      '91100000-0000-4000-8000-000000000001'::uuid,
      '91100000-0000-4000-8000-000000000003'::uuid
    ],
    array[
      '91100000-0000-4000-8000-000000000003'::uuid,
      '91100000-0000-4000-8000-000000000002'::uuid,
      '91100000-0000-4000-8000-000000000001'::uuid
    ]
  ),
  'Sort/order RPC applies a complete validated order'
);

select is(
  (
    select count(*)::integer
    from public.list_manual_crate_history('91200000-0000-4000-8000-000000000002', 10)
    where change_kind = 'move' and can_undo
  ),
  0,
  'A later sort supersedes the earlier move'
);

select lives_ok(
  $$select public.undo_manual_crate_history(
    (select id from public.list_manual_crate_history(
      '91200000-0000-4000-8000-000000000002'::uuid, 10
    ) where change_kind = 'sort' and can_undo limit 1)
  )$$,
  'Sort can be undone atomically'
);

select ok(
  (
    select can_undo
    from public.list_manual_crate_history('91200000-0000-4000-8000-000000000002', 10)
    where change_kind = 'move'
    limit 1
  ),
  'Undoing the latest sort exposes the preceding move as undoable'
);

insert into public.crate_tracks (user_id, crate_id, track_id, position)
values
  ('91000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000003', '91100000-0000-4000-8000-000000000001', 0),
  ('91000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000004', '91100000-0000-4000-8000-000000000002', 0),
  ('91000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000004', '91100000-0000-4000-8000-000000000003', 1);

select lives_ok(
  $$select public.merge_manual_crates(
    '91200000-0000-4000-8000-000000000004'::uuid,
    '91200000-0000-4000-8000-000000000003'::uuid,
    array[
      '91100000-0000-4000-8000-000000000002'::uuid,
      '91100000-0000-4000-8000-000000000003'::uuid
    ],
    array['91100000-0000-4000-8000-000000000001'::uuid]
  )$$,
  'Merge records its target change atomically'
);

select is(
  (
    select change_kind
    from public.list_manual_crate_history('91200000-0000-4000-8000-000000000003', 10)
    where can_undo
    limit 1
  ),
  'merge',
  'Merge target has an undoable history entry'
);

insert into public.crate_tracks (user_id, crate_id, track_id, position)
values
  ('91000000-0000-4000-8000-000000000001', '91200000-0000-4000-8000-000000000005', '91100000-0000-4000-8000-000000000001', 0);

select lives_ok(
  $$select public.reconcile_crate_tracks(
    '91200000-0000-4000-8000-000000000005'::uuid,
    array[
      '91100000-0000-4000-8000-000000000002'::uuid,
      '91100000-0000-4000-8000-000000000003'::uuid
    ],
    true
  )$$,
  'VirtualDJ reconciliation participates in crate history'
);

select is(
  (
    select change_kind
    from public.list_manual_crate_history('91200000-0000-4000-8000-000000000005', 10)
    where can_undo
    limit 1
  ),
  'reconcile',
  'Reconciliation records one undoable entry'
);

insert into public.crate_tracks (user_id, crate_id, track_id, position)
values (
  '91000000-0000-4000-8000-000000000001',
  '91200000-0000-4000-8000-000000000005',
  '91100000-0000-4000-8000-000000000004',
  99
);

select throws_ok(
  $$select public.undo_manual_crate_history(
    (select id from private.manual_crate_history
     where user_id = '91000000-0000-4000-8000-000000000001'::uuid
       and crate_id = '91200000-0000-4000-8000-000000000005'::uuid
       and change_kind = 'reconcile'
     order by revision desc limit 1)
  )$$,
  'P0001',
  'Crate changed after history entry',
  'Undo refuses a direct later crate change that is absent from history'
);

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true);

select throws_ok(
  $$select * from public.list_manual_crate_history(
    '91200000-0000-4000-8000-000000000001'::uuid,
    10
  )$$,
  'P0001',
  'Manual crate not found',
  'Another user cannot list the owner crate history'
);

select * from finish();
rollback;
