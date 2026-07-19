"use client";

import {
  deleteCrateAction,
  deleteTagAction,
} from "@/app/crates/actions";

export function DeleteCrateForm({
  crateId,
  name,
  revision,
}: {
  crateId: string;
  name: string;
  revision: string;
}) {
  return (
    <form
      action={deleteCrateAction}
      data-offline-action="crate-delete"
      data-offline-confirm={`¿Eliminar el crate “${name}”? Las canciones no se borrarán de tu biblioteca.`}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `¿Eliminar el crate “${name}”? Las canciones no se borrarán de tu biblioteca.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={crateId} />
      <input name="revision" type="hidden" value={revision} />
      <button className="button button--danger" type="submit">
        Eliminar crate
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
  return (
    <form
      action={deleteTagAction}
      data-offline-action="tag-delete"
      data-offline-confirm={`¿Eliminar la etiqueta “${name}”? Se quitará de todas las canciones.`}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `¿Eliminar la etiqueta “${name}”? Se quitará de todas las canciones.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={tagId} />
      <input name="revision" type="hidden" value={revision} />
      <button className="organization-icon-button" type="submit">
        Eliminar
      </button>
    </form>
  );
}
