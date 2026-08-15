begin;

select plan(8);

insert into auth.users (id, email)
values ('73000000-0000-4000-8000-000000000003', 'tag-history-superseded@djorganizer.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '73000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.tracks (id, user_id, title)
values (
  '73100000-0000-4000-8000-000000000003',
  '73000000-0000-4000-8000-000000000003',
  'Superseded tag history'
);

insert into public.tags (id, user_id, name)
values (
  '73200000-0000-4000-8000-000000000003',
  '73000000-0000-4000-8000-000000000003',
  'Latest state'
);

insert into public.track_tags (user_id, tag_id, track_id)
values (
  '73000000-0000-4000-8000-000000000003',
  '73200000-0000-4000-8000-000000000003',
  '73100000-0000-4000-8000-000000000003'
);

delete from public.track_tags
where user_id = '73000000-0000-4000-8000-000000000003'
  and tag_id = '73200000-0000-4000-8000-000000000003'
  and track_id = '73100000-0000-4000-8000-000000000003';

insert into public.track_tags (user_id, tag_id, track_id)
values (
  '73000000-0000-4000-8000-000000000003',
  '73200000-0000-4000-8000-000000000003',
  '73100000-0000-4000-8000-000000000003'
);

select is(
  (
    select count(*)::integer
    from public.list_track_tag_history(20)
    where operation = 'add' and can_undo
  ),
  1,
  'Only the newest overlapping add remains undoable'
);

select is(
  (
    select count(*)::integer
    from public.list_track_tag_history(20)
    where operation = 'add' and not can_undo
  ),
  1,
  'The older add is marked superseded'
);

select set_config(
  'test.superseded_add_id',
  (
    select id::text
    from public.list_track_tag_history(20)
    where operation = 'add' and not can_undo
    limit 1
  ),
  true
);

select throws_ok(
  $$select public.undo_track_tag_history(
    current_setting('test.superseded_add_id')::uuid
  )$$,
  'P0001',
  'Tag history entry was superseded by a later change',
  'Undo rejects a superseded add even when membership matches its after-state'
);

select is(
  (
    select count(*)::integer
    from public.track_tags
    where user_id = '73000000-0000-4000-8000-000000000003'
      and tag_id = '73200000-0000-4000-8000-000000000003'
      and track_id = '73100000-0000-4000-8000-000000000003'
  ),
  1,
  'Rejected old undo preserves the newest assignment'
);

select lives_ok(
  $$select public.undo_track_tag_history(
    (select id from public.list_track_tag_history(20)
     where operation = 'add' and can_undo limit 1)
  )$$,
  'The newest add can be undone first'
);

select ok(
  (
    select can_undo
    from public.list_track_tag_history(20)
    where operation = 'remove' and undone_at is null
    limit 1
  ),
  'After undoing the newest add, the preceding remove becomes undoable'
);

select lives_ok(
  $$select public.undo_track_tag_history(
    (select id from public.list_track_tag_history(20)
     where operation = 'remove' and can_undo limit 1)
  )$$,
  'Undo can then walk safely backward through the tag history'
);

select is(
  (
    select count(*)::integer
    from public.track_tags
    where user_id = '73000000-0000-4000-8000-000000000003'
      and tag_id = '73200000-0000-4000-8000-000000000003'
      and track_id = '73100000-0000-4000-8000-000000000003'
  ),
  1,
  'Undoing the preceding remove restores the earlier assignment'
);

select * from finish();
rollback;
