alter table public.tracks
  add column genre_analyzer_id text,
  add column genre_analyzer_version text,
  add column genre_compatibility_key text,
  add column genre_analyzed_at_ms bigint,
  add column genre_raw_score double precision,
  add column subgenre_analyzer_id text,
  add column subgenre_analyzer_version text,
  add column subgenre_compatibility_key text,
  add column subgenre_analyzed_at_ms bigint,
  add column subgenre_raw_score double precision;

alter table public.tracks
  add constraint tracks_genre_analyzer_evidence_check check (
    (genre_analyzer_id is null and genre_analyzer_version is null and
      genre_compatibility_key is null and genre_analyzed_at_ms is null and
      genre_raw_score is null)
    or
    (genre is not null and genre_source = 'automatic' and
      genre_analyzer_id is not null and genre_analyzer_version is not null and
      genre_compatibility_key is not null and genre_analyzed_at_ms is not null and
      genre_raw_score is not null and genre_raw_score not in ('Infinity', '-Infinity', 'NaN'))
  ),
  add constraint tracks_subgenre_analyzer_evidence_check check (
    (subgenre_analyzer_id is null and subgenre_analyzer_version is null and
      subgenre_compatibility_key is null and subgenre_analyzed_at_ms is null and
      subgenre_raw_score is null)
    or
    (subgenre is not null and subgenre_source = 'automatic' and
      subgenre_analyzer_id is not null and subgenre_analyzer_version is not null and
      subgenre_compatibility_key is not null and subgenre_analyzed_at_ms is not null and
      subgenre_raw_score is not null and subgenre_raw_score not in ('Infinity', '-Infinity', 'NaN'))
  );

comment on column public.tracks.genre_raw_score is
  'Technical analyzer score; not a confidence or probability.';
comment on column public.tracks.subgenre_raw_score is
  'Technical analyzer score; not a confidence or probability.';
