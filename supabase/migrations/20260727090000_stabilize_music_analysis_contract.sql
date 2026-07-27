-- Stabilize provider-neutral analysis metadata and the public 0-10 energy scale.
alter table public.tracks drop constraint if exists tracks_energy_check;
alter table public.tracks drop constraint if exists tracks_bpm_source_check;
alter table public.tracks drop constraint if exists tracks_key_source_check;
alter table public.tracks drop constraint if exists tracks_genre_source_check;
alter table public.tracks drop constraint if exists tracks_bpm_confidence_source_check;
alter table public.tracks drop constraint if exists tracks_key_confidence_source_check;
alter table public.tracks drop constraint if exists tracks_bpm_confidence_is_local;
alter table public.tracks drop constraint if exists tracks_key_confidence_is_local;

update public.tracks
set energy = greatest(0, least(10, round(energy::numeric / 10)::smallint))
where energy is not null;

update public.tracks set bpm_source = 'automatic' where bpm_source = 'local';
update public.tracks set key_source = 'automatic' where key_source = 'local';
update public.tracks set genre_source = 'automatic' where genre_source = 'openai';

alter table public.tracks
  add column subgenre text null,
  add column subgenre_source text null,
  add column subgenre_confidence real null,
  add column energy_source text null,
  add column energy_confidence real null;

update public.tracks set energy_source = 'unknown' where energy is not null;

alter table public.tracks
  add constraint tracks_energy_check check (energy is null or energy between 0 and 10),
  add constraint tracks_subgenre_length_check check (subgenre is null or char_length(subgenre) <= 120),
  add constraint tracks_bpm_source_check check (bpm_source is null or bpm_source in ('automatic','metadata','manual','unknown')),
  add constraint tracks_key_source_check check (key_source is null or key_source in ('automatic','metadata','manual','unknown')),
  add constraint tracks_genre_source_check check (genre_source is null or genre_source in ('automatic','metadata','manual','unknown')),
  add constraint tracks_energy_source_check check (energy_source is null or energy_source in ('automatic','metadata','manual','unknown')),
  add constraint tracks_subgenre_source_check check (subgenre_source is null or subgenre_source in ('automatic','metadata','manual','unknown')),
  add constraint tracks_bpm_confidence_source_check check (bpm_confidence is null or bpm_source = 'automatic'),
  add constraint tracks_key_confidence_source_check check (key_confidence is null or key_source = 'automatic'),
  add constraint tracks_genre_confidence_source_check check (genre_confidence is null or genre_source = 'automatic'),
  add constraint tracks_energy_confidence_check check (energy_confidence is null or (energy_confidence between 0 and 1 and energy_source = 'automatic')),
  add constraint tracks_subgenre_confidence_check check (subgenre_confidence is null or (subgenre_confidence between 0 and 1 and subgenre_source = 'automatic')),
  add constraint tracks_energy_evidence_check check ((energy is null and energy_source is null and energy_confidence is null) or (energy is not null and energy_source is not null)),
  add constraint tracks_subgenre_evidence_check check ((subgenre is null and subgenre_source is null and subgenre_confidence is null) or (subgenre is not null and subgenre_source is not null));

comment on column public.tracks.bpm_confidence is 'Automatic analyzer confidence from 0 to 1; NULL for metadata, manual and legacy values.';
comment on column public.tracks.key_confidence is 'Automatic analyzer confidence from 0 to 1; NULL for metadata, manual and legacy values.';
