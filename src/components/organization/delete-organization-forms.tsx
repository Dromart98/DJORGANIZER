"use client";

import {
  deleteCrateAction,
  deleteTagAction,
} from "@/app/crates/actions";
import { useTranslator } from "@/components/i18n/locale-provider";

export function DeleteCrateForm({
  crateId,
  name,
  revision,
}: {
  crateId: string;
  name: string;
  revision: string;
}) {
  const { format, t } = useTranslator();
  const confirmation = format(
    "¿Eliminar el crate “{name}”? Las canciones no se borrarán de tu biblioteca.",
    { name },
  );
  return (
    <form
      action={deleteCrateAction}
      data-offline-action="crate-delete"
      data-offline-confirm={confirmation}
      onSubmit={(event) => {
        if (
          !window.confirm(confirmation)
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={crateId} />
      <input name="revision" type="hidden" value={revision} />
      <button className="button button--danger" type="submit">
        {t("Eliminar crate")}
      </button>
    </form>
  );
}

export function DeleteTagForm({
  name,
  revision,
  tagId,
}: {
  name: string;
  revision: string;
  tagId: string;
}) {
  const { format, t } = useTranslator();
  const confirmation = format(
    "¿Eliminar la etiqueta “{name}”? Se quitará de todas las canciones.",
    { name },
  );
  return (
    <form
      action={deleteTagAction}
      data-offline-action="tag-delete"
      data-offline-confirm={confirmation}
      onSubmit={(event) => {
        if (
          !window.confirm(confirmation)
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={tagId} />
      <input name="revision" type="hidden" value={revision} />
      <button className="organization-icon-button" type="submit">
        {t("Eliminar")}
      </button>
    </form>
  );
}
