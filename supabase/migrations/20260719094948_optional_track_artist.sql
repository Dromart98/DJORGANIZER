set local lock_timeout = '5s';

alter table public.tracks
  alter column artist drop not null;

alter table public.tracks
  drop constraint if exists tracks_artist_check;

alter table public.tracks
  add constraint tracks_artist_check
  check (artist is null or char_length(artist) between 1 and 300);

comment on column public.tracks.artist is
  'Optional artist metadata. NULL means the source did not provide an artist or the user left it blank.';
