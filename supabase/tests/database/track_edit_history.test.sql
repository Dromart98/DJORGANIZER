begin;

select plan(16);

insert into auth.users (id, email)
values
  ('61000000-0000-4000-8000-000000000001', 'history-a@djorganizer.test'),
  ('62000000-0000-4000-8000-000000000002', 'history-b@djorganizer.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.tracks (
  id,
  user_id,
  title,
  artist,
  genre,
  genre_source,
  rating
)
values (
  '61100000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  'Before',
  'Artist',
  'House',
  'manual',
  null
);

select lives_ok(
  $$select public.update_track_with_history(
    '61100000-0000-4000-8000-000000000001'::uuid,
    (select updated_at from public.tracks where id = '61100000-0000-4000-8000-000000000001'),
    '{"title":"After","rating":5}'::jsonb
  )$$,
  'An owner can atomically update a track and create history'
);

select is(
  (select title from public.tracks where id = '61100000-0000-4000-8000-000000000001'),
  'After',
  'The requested title is persisted'
);

select is(
  (select rating from public.tracks where id = '61100000-0000-4000-8000-000000000001'),
  5::smallint,
  'The requested rating is persisted'
);

select is(
  (
    select count(*)::integer
    from public.track_edit_history
    where track_id = '61100000-0000-4000-8000-000000000001'
  ),
  1,
  'One history entry is recorded for the individual edit'
);

select is(
  (
    select changed_fields
    from public.track_edit_history
    where track_id = '61100000-0000-4000-8000-000000000001'
    order by created_at desc, id desc
    limit 1
  ),
  array['rating', 'title']::text[],
  'History records only fields that actually changed'
);

select lives_ok(
  $$select public.undo_track_edit(
    (select id from public.track_edit_history
     where track_id = '61100000-0000-4000-8000-000000000001'
     order by created_at desc, id desc limit 1)
  )$$,
  'A compatible individual edit can be undone'
);

select is(
  (select title from public.tracks where id = '61100000-0000-4000-8000-000000000001'),
  'Before',
  'Undo restores the previous title'
);

select is(
  (select rating from public.tracks where id = '61100000-0000-4000-8000-000000000001'),
  null::smallint,
  'Undo restores the previous nullable rating'
);

select ok(
  (
    select undone_at is not null
    from public.track_edit_history
    where track_id = '61100000-0000-4000-8000-000000000001'
    order by created_at desc, id desc
    limit 1
  ),
  'The undone history entry is marked as consumed'
);

select throws_ok(
  $$select public.undo_track_edit(
    (select id from public.track_edit_history
     where track_id = '61100000-0000-4000-8000-000000000001'
     order by created_at desc, id desc limit 1)
  )$$,
  'P0001',
  'History entry already undone',
  'The same history entry cannot be undone twice'
);

select throws_ok(
  $$select public.update_track_with_history(
    '61100000-0000-4000-8000-000000000001'::uuid,
    '2000-01-01 00:00:00+00'::timestamptz,
    '{"title":"Stale overwrite"}'::jsonb
  )$$,
  'P0001',
  'Track changed after form loaded',
  'A stale form revision cannot overwrite the current track'
);

select lives_ok(
  $$select public.update_track_with_history(
    '61100000-0000-4000-8000-000000000001'::uuid,
    (select updated_at from public.tracks where id = '61100000-0000-4000-8000-000000000001'),
    '{"title":"Second edit"}'::jsonb
  )$$,
  'A later individual edit creates a new undoable history entry'
);

update public.tracks
set title = 'External later change'
where id = '61100000-0000-4000-8000-000000000001';

select throws_ok(
  $$select public.undo_track_edit(
    (select id from public.track_edit_history
     where track_id = '61100000-0000-4000-8000-000000000001'
       and undone_at is null
     order by created_at desc, id desc limit 1)
  )$$,
  'P0001',
  'Track changed after history entry',
  'Undo refuses to overwrite a later incompatible track change'
);

select set_config('request.jwt.claim.sub', '62000000-0000-4000-8000-000000000002', true);

select is(
  (
    select count(*)::integer
    from public.track_edit_history
    where track_id = '61100000-0000-4000-8000-000000000001'
  ),
  0,
  'History rows are isolated by RLS from another user'
);

select throws_ok(
  $$select * from public.list_track_edit_history(
    '61100000-0000-4000-8000-000000000001'::uuid,
    20
  )$$,
  'P0001',
  'Track not found',
  'Another user cannot list the owner history through the RPC'
);

select throws_ok(
  $$select public.update_track_with_history(
    '61100000-0000-4000-8000-000000000001'::uuid,
    now(),
    '{"title":"Other user edit"}'::jsonb
  )$$,
  'P0001',
  'Track not found',
  'Another user cannot edit the owner track through the history RPC'
);

select * from finish();
rollback;
