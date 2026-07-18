create index track_tags_track_id_user_id_idx
  on public.track_tags (track_id, user_id);

create index crate_tracks_crate_id_user_id_idx
  on public.crate_tracks (crate_id, user_id);
