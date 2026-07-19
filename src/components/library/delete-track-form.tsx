"use client";

import { deleteTrackAction } from "@/app/library/actions";

export function DeleteTrackForm({
  revision,
  title,
  trackId,
}: {
  revision: string;
  title: string;
  trackId: string;
}) {
  return (
    <form
      action={deleteTrackAction}
      data-offline-action="track-delete"
      data-offline-confirm={`¿Eliminar “${title}”? Esta acción no se puede deshacer.`}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `¿Eliminar “${title}”? Esta acción no se puede deshacer.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={trackId} />
      <input name="revision" type="hidden" value={revision} />
      <button className="button button--danger" type="submit">
        Eliminar canción
      </button>
    </form>
  );
}
