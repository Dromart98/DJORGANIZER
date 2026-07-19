alter table public.tracks
  add column bpm_source text
    check (bpm_source is null or bpm_source in ('local', 'manual', 'metadata', 'unknown')),
  add column bpm_confidence numeric(4, 3)
    check (bpm_confidence is null or bpm_confidence between 0 and 1),
  add column bpm_explanation text
    check (bpm_explanation is null or char_length(bpm_explanation) <= 500),
  add column key_source text
    check (key_source is null or key_source in ('local', 'manual', 'metadata', 'unknown')),
  add column key_confidence numeric(4, 3)
    check (key_confidence is null or key_confidence between 0 and 1),
  add column key_explanation text
    check (key_explanation is null or char_length(key_explanation) <= 500);

update public.tracks
set
  bpm_source = case when bpm is null then null else 'unknown' end,
  bpm_explanation = case
    when bpm is null then null
    else 'Procedencia anterior a la medición de confianza.'
  end,
  key_source = case when musical_key is null then null else 'unknown' end,
  key_explanation = case
    when musical_key is null then null
    else 'Procedencia anterior a la medición de confianza.'
  end;

alter table public.tracks
  add constraint tracks_bpm_analysis_requires_value
    check (
      bpm is not null
      or (
        bpm_source is null
        and bpm_confidence is null
        and bpm_explanation is null
      )
    ),
  add constraint tracks_key_analysis_requires_value
    check (
      musical_key is not null
      or (
        key_source is null
        and key_confidence is null
        and key_explanation is null
      )
    ),
  add constraint tracks_bpm_confidence_is_local
    check (bpm_confidence is null or bpm_source = 'local'),
  add constraint tracks_key_confidence_is_local
    check (key_confidence is null or key_source = 'local');

comment on column public.tracks.bpm_confidence is
  'Local detector confidence from 0 to 1; NULL for metadata, manual and legacy values.';
comment on column public.tracks.key_confidence is
  'Local chroma detector confidence from 0 to 1; NULL for metadata, manual and legacy values.';
