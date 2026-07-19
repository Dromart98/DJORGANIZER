"use client";

import { deleteTrackAction } from "@/app/library/actions";
import { useTranslator } from "@/components/i18n/locale-provider";

export function DeleteTrackForm({
  revision,
  title,
  trackId,
}: {
  revision: string;
  title: string;
  trackId: string;
}) {
  const { format, t } = useTranslator();
  const confirmation = format(
    "¿Eliminar “{name}”? Esta acción no se puede deshacer.",
    { name: title },
  );
  return (
    <form
      action={deleteTrackAction}
      data-offline-action="track-delete"
      data-offline-confirm={confirmation}
      onSubmit={(event) => {
        if (
          !window.confirm(confirmation)
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={trackId} />
      <input name="revision" type="hidden" value={revision} />
      <button className="button button--danger" type="submit">
        {t("Eliminar canción")}
      </button>
    </form>
  );
}
