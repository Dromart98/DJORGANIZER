begin;

select plan(17);

insert into auth.users (id, email)
values
  ('81000000-0000-4000-8000-000000000001', 'archive-history-a@djorganizer.test'),
  ('82000000-0000-4000-8000-000000000002', 'archive-history-b@djorganizer.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.tracks (id, user_id, title)
values (
  '81100000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'Archive history track'
);

update public.tracks
set archived_at = '2026-08-15 18:00:00+00'::timestamptz
where id = '81100000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.list_track_archive_history(20)),
  1,
  'Archiving a track records one history entry'
);

select is(
  (select operation from public.list_track_archive_history(20) limit 1),
  'archive',
  'The first history entry records an archive operation'
);

select ok(
  (select can_undo from public.list_track_archive_history(20) limit 1),
  'A compatible archive operation is undoable'
);

select set_config(
  'test.first_archive_history_id',
  (select id::text from public.list_track_archive_history(20) limit 1),
  true
);

select lives_ok(
  $$select public.undo_track_archive_history(
    current_setting('test.first_archive_history_id')::uuid
  )$$,
  'A compatible archive operation can be undone'
);

select is(
  (select archived_at from public.tracks where id = '81100000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'Undo restores the active state'
);

select ok(
  (
    select undone_at is not null
    from public.list_track_archive_history(20)
    where id = current_setting('test.first_archive_history_id')::uuid
  ),
  'The consumed archive history entry is marked undone'
);

update public.tracks
set archived_at = '2026-08-15 18:10:00+00'::timestamptz
where id = '81100000-0000-4000-8000-000000000001';

update public.tracks
set archived_at = null
where id = '81100000-0000-4000-8000-000000000001';

select is(
  (
    select count(*)::integer
    from public.list_track_archive_history(20)
    where operation = 'restore' and can_undo
  ),
  1,
  'The newest restore is the only current undo target'
);

select is(
  (
    select count(*)::integer
    from public.list_track_archive_history(20)
    where operation = 'archive'
      and undone_at is null
      and not can_undo
  ),
  1,
  'The preceding archive is superseded while the restore is active'
);

select lives_ok(
  $$select public.undo_track_archive_history(
    (select id from public.list_track_archive_history(20)
     where operation = 'restore' and can_undo limit 1)
  )$$,
  'Undoing the restore returns to the archived state'
);

select is(
  (select archived_at from public.tracks where id = '81100000-0000-4000-8000-000000000001'),
  '2026-08-15 18:10:00+00'::timestamptz,
  'Undo restores the exact prior archive marker'
);

select ok(
  (
    select can_undo
    from public.list_track_archive_history(20)
    where operation = 'archive' and undone_at is null
    limit 1
  ),
  'After undoing the restore, the preceding archive becomes undoable'
);

select lives_ok(
  $$select public.undo_track_archive_history(
    (select id from public.list_track_archive_history(20)
     where operation = 'archive' and can_undo limit 1)
  )$$,
  'Undo can safely walk backward through archive history'
);

select is(
  (select archived_at from public.tracks where id = '81100000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'Undoing the preceding archive returns the track to active'
);

update public.tracks
set archived_at = '2026-08-15 18:20:00+00'::timestamptz
where id = '81100000-0000-4000-8000-000000000001';

select set_config(
  'test.external_change_history_id',
  (select id::text from public.list_track_archive_history(20)
   where operation = 'archive' and can_undo limit 1),
  true
);

update public.tracks
set archived_at = '2026-08-15 18:21:00+00'::timestamptz
where id = '81100000-0000-4000-8000-000000000001';

select throws_ok(
  $$select public.undo_track_archive_history(
    current_setting('test.external_change_history_id')::uuid
  )$$,
  'P0001',
  'Track archive state changed after history entry',
  'Undo refuses to overwrite a later archive-state timestamp change'
);

select is(
  (select archived_at from public.tracks where id = '81100000-0000-4000-8000-000000000001'),
  '2026-08-15 18:21:00+00'::timestamptz,
  'A rejected undo preserves the later archive state'
);

select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::integer from public.list_track_archive_history(20)),
  0,
  'Another user cannot list the owner archive history'
);

select throws_ok(
  $$select public.undo_track_archive_history(
    current_setting('test.external_change_history_id')::uuid
  )$$,
  'P0001',
  'Archive history entry not found',
  'Another user cannot undo the owner archive history'
);

select * from finish();
rollback;
