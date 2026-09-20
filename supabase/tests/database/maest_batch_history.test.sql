begin;
select no_plan();

insert into auth.users (id, email) values
 ('81000000-0000-4000-8000-000000000001', 'maest-history-a@djorganizer.test'),
 ('82000000-0000-4000-8000-000000000002', 'maest-history-b@djorganizer.test');
insert into public.tracks (id, user_id, title, genre, genre_source, subgenre, subgenre_source) values
 ('81100000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'One', 'House', 'manual', 'Deep House', 'manual'),
 ('81100000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001', 'Two', null, null, null, null),
 ('82100000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000002', 'Other', 'House', 'manual', null, null);

create function pg_temp.selection(field text, expected text, proposed text)
returns jsonb language sql as $$
 select jsonb_build_object('expected_value', expected, 'patch', jsonb_build_object(
   field, proposed, field || '_source', 'automatic', field || '_confidence', null,
   field || '_analyzer_id', 'djorganizer.desktop.genre.maest',
   field || '_analyzer_version', 'discogs-maest-30s-pw-519l@2',
   field || '_compatibility_key', 'maest-519l|mel-16000-1876x96-f32|windows-start-center-end-mean|v3',
   field || '_analyzed_at_ms', 123456789, field || '_raw_score', 0.75));
$$;
create temporary table results (name text primary key, result jsonb);
grant all on results to authenticated;
create temporary table originals as select id, to_jsonb(t) - 'updated_at' as state from public.tracks t;
grant select on originals to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into results values ('independent', public.apply_maest_batch_with_history(jsonb_build_array(
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000001', 'genre', pg_temp.selection('genre', 'House', 'Disco')),
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000002', 'subgenre', pg_temp.selection('subgenre', null, 'Nu Disco')))));
select is((select result ->> 'changed_count' from results where name = 'independent'), '2', 'Two independent field changes');
select is((select result #>> '{items,0,subgenre}' from results where name = 'independent'), 'omitted', 'Unselected subgenre omitted');
select is((select result #>> '{items,1,genre}' from results where name = 'independent'), 'omitted', 'Unselected genre omitted');
select is((select subgenre from public.tracks where title = 'One'), 'Deep House', 'Genre selection preserves subgenre');
select is((select genre from public.tracks where title = 'Two'), null, 'Subgenre selection preserves genre');
select is((select count(*)::integer from public.track_edit_history), 2, 'One history member per changed track');
select ok((select bool_and(before_state ? 'genre_source' and after_state ? 'subgenre_raw_score') from public.track_edit_history), 'Snapshots retain provenance');
select ok((select bool_and(can_undo) from public.list_bulk_track_edit_batches()), 'Batch is undoable through existing contract');
select is((select field_name from public.list_bulk_track_edit_batches()), 'multiple', 'Independent mixed fields have an accurate summary');
select lives_ok($$select public.undo_bulk_track_edit((select (result ->> 'batch_id')::uuid from results where name = 'independent'))$$, 'Atomic undo succeeds');
select ok((select bool_and(to_jsonb(t) - 'updated_at' = o.state) from public.tracks t join originals o using(id)), 'Undo restores all original values and provenance');
select throws_ok($$select public.undo_bulk_track_edit((select (result ->> 'batch_id')::uuid from results where name = 'independent'))$$,
 'P0001', 'Bulk history batch already undone', 'Double undo rejected');

-- A real constraint violation exercises the field subtransaction: the genre
-- and the next track must still succeed when a subgenre cannot be written.
reset role;
alter table public.tracks add constraint maest_test_subgenre check (subgenre is distinct from 'Rejected subgenre');
set local role authenticated;
insert into results values ('partial', public.apply_maest_batch_with_history(jsonb_build_array(
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000001',
   'genre', pg_temp.selection('genre', 'House', 'Disco'), 'subgenre', pg_temp.selection('subgenre', 'Deep House', 'Rejected subgenre')),
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000002',
   'genre', pg_temp.selection('genre', 'stale', 'Techno'), 'subgenre', pg_temp.selection('subgenre', null, 'Nu Disco')),
 jsonb_build_object('track_id', '82100000-0000-4000-8000-000000000001', 'genre', pg_temp.selection('genre', 'House', 'Disco')),
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000099', 'genre', pg_temp.selection('genre', null, 'Disco')))));
select is((select result #>> '{items,0,genre}' from results where name = 'partial'), 'applied', 'Genre survives subgenre failure');
select is((select result #>> '{items,0,subgenre}' from results where name = 'partial'), 'failed', 'Write failure reported by field');
select is((select result #>> '{items,0,status}' from results where name = 'partial'), 'failed', 'Failure precedence preserved');
select is((select result #>> '{items,1,genre}' from results where name = 'partial'), 'conflict', 'Stale expected value conflicts');
select is((select result #>> '{items,1,subgenre}' from results where name = 'partial'), 'applied', 'Independent subgenre succeeds despite conflict');
select is((select result #>> '{items,2,status}' from results where name = 'partial'), 'failed', 'Foreign track fails without exposure');
select is((select result #>> '{items,3,status}' from results where name = 'partial'), 'failed', 'Missing track does not abort batch');
select is((select result ->> 'changed_count' from results where name = 'partial'), '2', 'History count excludes failed and unowned tracks');
select ok((select bool_and(not ('subgenre' = any(changed_fields))) from public.track_edit_history where track_id = '81100000-0000-4000-8000-000000000001'), 'History excludes failed field');
select lives_ok($$select public.undo_bulk_track_edit((select (result ->> 'batch_id')::uuid from results where name = 'partial'))$$, 'Partial batch can be undone');
select ok((select bool_and(to_jsonb(t) - 'updated_at' = o.state) from public.tracks t join originals o using(id)), 'Partial undo restores precisely applied changes');

insert into results values ('both', public.apply_maest_batch_with_history(jsonb_build_array(
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000001',
   'genre', pg_temp.selection('genre', 'House', 'Disco'), 'subgenre', pg_temp.selection('subgenre', 'Deep House', 'Nu Disco')),
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000002', 'genre', pg_temp.selection('genre', null, 'Disco')))));
select is((select count(*)::integer from public.track_edit_history where batch_id = (select (result ->> 'batch_id')::uuid from results where name = 'both')), 2, 'Two fields on one track still create only one member');
select is((select field_name from public.list_bulk_track_edit_batches() where batch_id = (select (result ->> 'batch_id')::uuid from results where name = 'both')), 'multiple', 'Both fields on one track are represented as multiple');

insert into results values ('noop', public.apply_maest_batch_with_history(jsonb_build_array(
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000002', 'genre', pg_temp.selection('genre', 'Disco', 'Disco')))));
select is((select result ->> 'batch_id' from results where name = 'noop'), null, 'Identical value and evidence produce no empty history batch');

-- Conflict on the last track must roll back any earlier restoration too.
update public.tracks set genre_raw_score = 0.5 where title = 'Two';
select throws_ok($$select public.undo_bulk_track_edit((select (result ->> 'batch_id')::uuid from results where name = 'both'))$$,
 'P0001', 'Bulk track changed after history entry', 'Later provenance change blocks atomic undo');
select is((select genre from public.tracks where title = 'One'), 'Disco', 'First track was not partially restored');
select is((select subgenre from public.tracks where title = 'One'), 'Nu Disco', 'Both fields stay unchanged after conflict');
select ok((select bool_and(undone_at is null) from public.track_edit_history where batch_id = (select (result ->> 'batch_id')::uuid from results where name = 'both')), 'Failed undo does not consume history');
select ok((select not can_undo from public.list_bulk_track_edit_batches() where batch_id = (select (result ->> 'batch_id')::uuid from results where name = 'both')), 'UI contract marks conflicting batch unavailable');
update public.tracks set genre = 'Later classification' where title = 'Two';
select throws_ok($$select public.undo_bulk_track_edit((select (result ->> 'batch_id')::uuid from results where name = 'both'))$$,
 'P0001', 'Bulk track changed after history entry', 'Later classification is not overwritten');

select set_config('request.jwt.claim.sub', '82000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.track_edit_history), 0, 'RLS hides other user history');
select is((select count(*)::integer from public.list_bulk_track_edit_batches()), 0, 'Listing hides other user batches');
select throws_ok($$select public.undo_bulk_track_edit((select (result ->> 'batch_id')::uuid from results where name = 'both'))$$,
 'P0001', 'Bulk history batch not found', 'Cross-user undo rejected');
select is((select genre from public.tracks where title = 'Other'), 'House', 'Foreign track was never modified');
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);

select throws_ok($$select public.apply_maest_batch_with_history('[]')$$, 'P0001', 'Invalid MAEST batch', 'Empty batch rejected');
select throws_ok($$select public.apply_maest_batch_with_history((select jsonb_agg('{}'::jsonb) from generate_series(1,26)))$$,
 'P0001', 'Invalid MAEST batch', 'Limit remains 25');
select throws_ok($$select public.apply_maest_batch_with_history(jsonb_build_array(
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000001', 'genre', pg_temp.selection('genre', 'Disco', 'House')),
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000001', 'genre', pg_temp.selection('genre', 'Disco', 'House'))))$$,
 'P0001', 'Duplicate MAEST batch track', 'Duplicates rejected before writes');
select throws_ok($$select public.apply_maest_batch_with_history(jsonb_build_array(
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000001', 'genre',
 jsonb_set(pg_temp.selection('genre', 'Disco', 'House'), '{patch,genre_analyzer_id}', '"forged"'))))$$,
 'P0001', 'Invalid MAEST evidence', 'Direct RPC cannot bypass analyzer validation');
select throws_ok($$select public.apply_maest_batch_with_history(jsonb_build_array(
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000001', 'genre',
 jsonb_set(pg_temp.selection('genre', 'Disco', 'House'), '{patch,genre_analyzed_at_ms}', '9007199254740992'))))$$,
 'P0001', 'Invalid MAEST evidence', 'Unsafe timestamps rejected');
select throws_ok($$select public.apply_maest_batch_with_history(jsonb_build_array(
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000001', 'genre',
 jsonb_set(pg_temp.selection('genre', 'Disco', 'House'), '{patch,rating}', '5'))))$$,
 'P0001', 'Invalid MAEST evidence', 'Unrelated patch fields rejected');
select ok(not has_function_privilege('anon', 'public.apply_maest_batch_with_history(jsonb)', 'EXECUTE'), 'Anonymous role cannot execute');

-- History failure must roll back metadata as well: no unrecorded changes.
reset role;
alter table public.track_edit_history add constraint maest_test_history
 check (after_state ->> 'genre' is distinct from 'Unrecordable');
set local role authenticated;
select throws_ok($$select public.apply_maest_batch_with_history(jsonb_build_array(
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000001', 'genre', pg_temp.selection('genre', 'Disco', 'Unrecordable'))))$$,
 '23514', 'new row for relation "track_edit_history" violates check constraint "maest_test_history"', 'A history insert failure cannot commit metadata');
select is((select genre from public.tracks where title = 'One'), 'Disco', 'No unrecorded write survives history failure');

insert into results values ('evidence-only', public.apply_maest_batch_with_history(jsonb_build_array(
 jsonb_build_object('track_id', '81100000-0000-4000-8000-000000000002', 'genre', pg_temp.selection('genre', 'Later classification', 'Later classification')))));
select is((select result ->> 'changed_count' from results where name = 'evidence-only'), '1', 'Provenance-only changes are recorded');
select lives_ok($$select public.undo_bulk_track_edit((select (result ->> 'batch_id')::uuid from results where name = 'evidence-only'))$$, 'Evidence-only change can be undone');
select is((select genre_raw_score from public.tracks where title = 'Two'), 0.5::double precision, 'Undo restores previous evidence');

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.apply_maest_batch_with_history('[]')$$, 'P0001', 'Authentication required', 'Null auth rejected');
select * from finish();
rollback;
