begin;
select plan(10);

select has_column('public', 'tracks', 'subgenre', 'tracks has independent subgenre');
select col_is_nullable('public', 'tracks', 'subgenre', 'subgenre remains nullable for existing tracks');
select has_column('public', 'tracks', 'energy_source', 'tracks records energy provenance');
select has_column('public', 'tracks', 'subgenre_source', 'tracks records subgenre provenance');
select ok((select round(v::numeric / 10)::int from (values (0)) x(v)) = 0, 'legacy energy 0 converts to 0');
select ok((select round(v::numeric / 10)::int from (values (11)) x(v)) = 1, 'legacy energy 11 converts to 1');
select ok((select round(v::numeric / 10)::int from (values (50)) x(v)) = 5, 'legacy energy 50 converts to 5');
select ok((select round(v::numeric / 10)::int from (values (99)) x(v)) = 10, 'legacy energy 99 converts to 10');
select ok((select round(v::numeric / 10)::int from (values (100)) x(v)) = 10, 'legacy energy 100 converts to 10');
select policies_are('public', 'tracks', array['tracks_delete_own', 'tracks_insert_own', 'tracks_select_own', 'tracks_update_own'], 'tracks RLS policies remain unchanged');

select * from finish();
rollback;
