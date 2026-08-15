begin;

select plan(18);

insert into auth.users (id, email)
values
  ('71000000-0000-4000-8000-000000000001', 'bulk-history-a@djorganizer.test'),
  ('72000000-0000-4000-8000-000000000002', 'bulk-history-b@djorganizer.test');

insert into public.tracks (id, user_id, title, genre, genre_source, rating)
values
  ('71100000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'Bulk One', 'House', 'manual', 1),
  ('71100000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 'Bulk Two', 'Techno', 'manual', 2),
  ('71100000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000001', 'Bulk Three', 'House', 'manual', 5),
  ('72100000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000002', 'Other User', 'House', 'manual', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.bulk_update_tracks_with_history(
    array[
      '71100000-0000-4000-8000-000000000001'::uuid,
      '71100000-0000-4000-8000-000000000002'::uuid
    ],
    '{"rating":5}'::jsonb
  )$$,
  'An owner can apply one atomic bulk edit'
);

select is(
  (select rating from public.tracks where id = '71100000-0000-4000-8000-000000000001'),
  5::smallint,
  'The first selected track is updated'
);

select is(
  (select rating from public.tracks where id = '71100000-0000-4000-8000-000000000002'),
  5::smallint,
  'The second selected track is updated'
);

select is(
  (
    select count(*)::integer
    from public.track_edit_history
    where change_kind = 'bulk_edit'
      and batch_id = (
        select batch_id
        from public.track_edit_history
        where track_id = '71100000-0000-4000-8000-000000000001'
          and change_kind = 'bulk_edit'
        limit 1
      )
  ),
  2,
  'One history row per changed track shares the same batch'
);

select is(
  (
    select count(distinct batch_id)::integer
    from public.track_edit_history
    where change_kind = 'bulk_edit'
      and track_id in (
        '71100000-0000-4000-8000-000000000001',
        '71100000-0000-4000-8000-000000000002'
      )
  ),
  1,
  'The selected changes are grouped into one batch'
);

select is(
  (
    select count(*)::integer
    from public.list_track_edit_history(
      '71100000-0000-4000-8000-000000000001'::uuid,
      20
    )
  ),
  0,
  'Bulk history is not exposed as individually undoable track history'
);

select throws_ok(
  $$select public.undo_track_edit(
    (select id from public.track_edit_history
     where track_id = '71100000-0000-4000-8000-000000000001'
       and change_kind = 'bulk_edit'
     limit 1)
  )$$,
  'P0001',
  'History entry not found',
  'A bulk member cannot be undone individually'
);

select is(
  (
    select count(*)::integer
    from public.list_bulk_track_edit_batches(10)
    where can_undo
  ),
  1,
  'The compatible bulk batch is listed as undoable'
);

select lives_ok(
  $$select public.undo_bulk_track_edit(
    (select batch_id from public.track_edit_history
     where track_id = '71100000-0000-4000-8000-000000000001'
       and change_kind = 'bulk_edit'
     limit 1)
  )$$,
  'A compatible bulk batch can be undone atomically'
);

select is(
  (select rating from public.tracks where id = '71100000-0000-4000-8000-000000000001'),
  1::smallint,
  'Bulk undo restores the first previous value'
);

select is(
  (select rating from public.tracks where id = '71100000-0000-4000-8000-000000000002'),
  2::smallint,
  'Bulk undo restores the second previous value'
);

select ok(
  (
    select bool_and(undone_at is not null)
    from public.track_edit_history
    where change_kind = 'bulk_edit'
  ),
  'Undo consumes every history member in the batch'
);

select lives_ok(
  $$select public.bulk_update_tracks_with_history(
    array[
      '71100000-0000-4000-8000-000000000001'::uuid,
      '71100000-0000-4000-8000-000000000002'::uuid
    ],
    '{"genre":"Disco","genre_source":"manual"}'::jsonb
  )$$,
  'A second bulk edit can be recorded'
);

update public.tracks
set genre = 'Later manual change'
where id = '71100000-0000-4000-8000-000000000002';

select throws_ok(
  $$select public.undo_bulk_track_edit(
    (select batch_id from public.track_edit_history
     where track_id = '71100000-0000-4000-8000-000000000001'
       and change_kind = 'bulk_edit'
       and undone_at is null
     order by created_at desc
     limit 1)
  )$$,
  'P0001',
  'Bulk track changed after history entry',
  'Bulk undo refuses to overwrite a later change in any batch member'
);

select is(
  (select genre from public.tracks where id = '71100000-0000-4000-8000-000000000001'),
  'Disco',
  'A rejected undo leaves earlier batch members untouched'
);

select set_config(
  'test.owner_bulk_batch_id',
  (
    select batch_id::text
    from public.track_edit_history
    where user_id = '71000000-0000-4000-8000-000000000001'
      and change_kind = 'bulk_edit'
    order by created_at desc
    limit 1
  ),
  true
);

select throws_ok(
  $$select public.bulk_update_tracks_with_history(
    array[
      '71100000-0000-4000-8000-000000000001'::uuid,
      '72100000-0000-4000-8000-000000000001'::uuid
    ],
    '{"rating":4}'::jsonb
  )$$,
  'P0001',
  'Bulk track selection changed',
  'A batch cannot include another user track'
);

select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::integer from public.list_bulk_track_edit_batches(10)),
  0,
  'Another user cannot list the owner bulk history'
);

select throws_ok(
  $$select public.undo_bulk_track_edit(
    current_setting('test.owner_bulk_batch_id')::uuid
  )$$,
  'P0001',
  'Bulk history batch not found',
  'Another user cannot undo the owner bulk batch'
);

select * from finish();
rollback;
