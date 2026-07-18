"use client";

import { deleteTrackAction } from "@/app/library/actions";

export function DeleteTrackForm({
  title,
  trackId,
}: {
  title: string;
  trackId: string;
}) {
  return (
    <form
      action={deleteTrackAction}
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
      <button className="button button--danger" type="submit">
        Eliminar canción
      </button>
    </form>
  );
}
