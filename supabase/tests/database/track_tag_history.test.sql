begin;

select plan(15);

insert into auth.users (id, email)
values
  ('71000000-0000-4000-8000-000000000001', 'tag-history-a@djorganizer.test'),
  ('72000000-0000-4000-8000-000000000002', 'tag-history-b@djorganizer.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.tracks (id, user_id, title)
values
  (
    '71100000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'Tag history one'
  ),
  (
    '71100000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    'Tag history two'
  );

insert into public.tags (id, user_id, name)
values (
  '71200000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'Peak'
);

insert into public.track_tags (user_id, tag_id, track_id)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '71200000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000001'
  ),
  (
    '71000000-0000-4000-8000-000000000001',
    '71200000-0000-4000-8000-000000000001',
    '71100000-0000-4000-8000-000000000002'
  );

select is(
  (select count(*)::integer from public.list_track_tag_history(20)),
  1,
  'One statement creates one tag history batch'
);

select is(
  (select operation from public.list_track_tag_history(20) limit 1),
  'add',
  'The batch records an assignment'
);

select is(
  (select track_count from public.list_track_tag_history(20) limit 1),
  2,
  'The batch preserves the exact changed track count'
);

select ok(
  (select can_undo from public.list_track_tag_history(20) limit 1),
  'A compatible tag assignment is undoable'
);

insert into public.track_tags (user_id, tag_id, track_id)
values (
  '71000000-0000-4000-8000-000000000001',
  '71200000-0000-4000-8000-000000000001',
  '71100000-0000-4000-8000-000000000001'
)
on conflict (track_id, tag_id) do nothing;

select is(
  (select count(*)::integer from public.list_track_tag_history(20)),
  1,
  'A no-op duplicate assignment does not create false history'
);

select set_config(
  'test.initial_tag_history_id',
  (select id::text from public.list_track_tag_history(20) limit 1),
  true
);

select lives_ok(
  $$select public.undo_track_tag_history(
    current_setting('test.initial_tag_history_id')::uuid
  )$$,
  'A compatible tag assignment batch can be undone'
);

select is(
  (
    select count(*)::integer
    from public.track_tags
    where user_id = '71000000-0000-4000-8000-000000000001'
      and tag_id = '71200000-0000-4000-8000-000000000001'
  ),
  0,
  'Undo removes only the assignments created by the batch'
);

select ok(
  (
    select undone_at is not null
    from public.list_track_tag_history(20)
    where id = current_setting('test.initial_tag_history_id')::uuid
  ),
  'The consumed tag history entry is marked undone'
);

select set_config('djorganizer.skip_tag_history', '1', true);
insert into public.track_tags (user_id, tag_id, track_id)
values (
  '71000000-0000-4000-8000-000000000001',
  '71200000-0000-4000-8000-000000000001',
  '71100000-0000-4000-8000-000000000001'
);
select set_config('djorganizer.skip_tag_history', '0', true);

delete from public.track_tags
where user_id = '71000000-0000-4000-8000-000000000001'
  and tag_id = '71200000-0000-4000-8000-000000000001'
  and track_id = '71100000-0000-4000-8000-000000000001';

select is(
  (
    select track_count
    from public.list_track_tag_history(20)
    where operation = 'remove' and undone_at is null
    order by created_at desc, id desc
    limit 1
  ),
  1,
  'Removing an existing assignment records only the removed track'
);

select set_config(
  'test.remove_tag_history_id',
  (
    select id::text
    from public.list_track_tag_history(20)
    where operation = 'remove' and undone_at is null
    order by created_at desc, id desc
    limit 1
  ),
  true
);

select lives_ok(
  $$select public.undo_track_tag_history(
    current_setting('test.remove_tag_history_id')::uuid
  )$$,
  'A compatible tag removal can be undone'
);

select is(
  (
    select count(*)::integer
    from public.track_tags
    where user_id = '71000000-0000-4000-8000-000000000001'
      and tag_id = '71200000-0000-4000-8000-000000000001'
      and track_id = '71100000-0000-4000-8000-000000000001'
  ),
  1,
  'Undo restores the removed assignment'
);

insert into public.track_tags (user_id, tag_id, track_id)
values (
  '71000000-0000-4000-8000-000000000001',
  '71200000-0000-4000-8000-000000000001',
  '71100000-0000-4000-8000-000000000002'
);

select set_config(
  'test.changed_tag_history_id',
  (
    select id::text
    from public.list_track_tag_history(20)
    where operation = 'add' and undone_at is null
    order by created_at desc, id desc
    limit 1
  ),
  true
);

delete from public.track_tags
where user_id = '71000000-0000-4000-8000-000000000001'
  and tag_id = '71200000-0000-4000-8000-000000000001'
  and track_id = '71100000-0000-4000-8000-000000000002';

select throws_ok(
  $$select public.undo_track_tag_history(
    current_setting('test.changed_tag_history_id')::uuid
  )$$,
  'P0001',
  'Track tag state changed after history entry',
  'Undo refuses to overwrite a later tag change'
);

select is(
  (
    select count(*)::integer
    from public.track_tags
    where user_id = '71000000-0000-4000-8000-000000000001'
      and tag_id = '71200000-0000-4000-8000-000000000001'
      and track_id = '71100000-0000-4000-8000-000000000002'
  ),
  0,
  'A rejected undo leaves the later tag state unchanged'
);

select set_config('request.jwt.claim.sub', '72000000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::integer from public.list_track_tag_history(20)),
  0,
  'Another user cannot list the owner tag history'
);

select throws_ok(
  $$select public.undo_track_tag_history(
    current_setting('test.remove_tag_history_id')::uuid
  )$$,
  'P0001',
  'Tag history entry not found',
  'Another user cannot undo the owner tag history'
);

select * from finish();
rollback;
