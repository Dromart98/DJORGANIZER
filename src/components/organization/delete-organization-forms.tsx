"use client";

import {
  deleteCrateAction,
  deleteTagAction,
} from "@/app/crates/actions";

export function DeleteCrateForm({
  crateId,
  name,
}: {
  crateId: string;
  name: string;
}) {
  return (
    <form
      action={deleteCrateAction}
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
      <button className="button button--danger" type="submit">
        Eliminar crate
      </button>
    </form>
  );
}

export function DeleteTagForm({
  name,
  tagId,
}: {
  name: string;
  tagId: string;
}) {
  return (
    <form
      action={deleteTagAction}
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
      <button className="organization-icon-button" type="submit">
        Eliminar
      </button>
    </form>
  );
}
