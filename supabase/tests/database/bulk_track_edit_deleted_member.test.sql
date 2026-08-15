begin;

select plan(5);

insert into auth.users (id, email)
values ('73000000-0000-4000-8000-000000000001', 'bulk-history-delete@djorganizer.test');

insert into public.tracks (id, user_id, title, rating)
values
  ('73100000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', 'Delete Guard One', 1),
  ('73100000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000001', 'Delete Guard Two', 2);

set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.bulk_update_tracks_with_history(
    array[
      '73100000-0000-4000-8000-000000000001'::uuid,
      '73100000-0000-4000-8000-000000000002'::uuid
    ],
    '{"rating":5}'::jsonb
  )$$,
  'A two-track bulk edit is recorded'
);

select set_config(
  'test.bulk_delete_batch_id',
  (select batch_id::text from public.list_bulk_track_edit_batches(10) limit 1),
  true
);

delete from public.tracks
where id = '73100000-0000-4000-8000-000000000002';

select is(
  (
    select track_count::integer
    from public.list_bulk_track_edit_batches(10)
    where batch_id = current_setting('test.bulk_delete_batch_id')::uuid
  ),
  2,
  'The original batch cardinality survives a deleted member'
);

select is(
  (
    select can_undo
    from public.list_bulk_track_edit_batches(10)
    where batch_id = current_setting('test.bulk_delete_batch_id')::uuid
  ),
  false,
  'A batch with a deleted member is not advertised as undoable'
);

select throws_ok(
  format(
    'select public.undo_bulk_track_edit(%L::uuid)',
    current_setting('test.bulk_delete_batch_id')
  ),
  'P0001',
  'Bulk track selection changed after history entry',
  'Undo rejects a batch whose original membership was reduced'
);

select is(
  (
    select rating
    from public.tracks
    where id = '73100000-0000-4000-8000-000000000001'
  ),
  5::smallint,
  'Rejected undo leaves the surviving track untouched'
);

select * from finish();
rollback;
