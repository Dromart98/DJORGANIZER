"use client";

import { undoBulkTrackEditAction } from "@/app/library/actions";
import type { Locale } from "@/lib/i18n/i18n";
import type { BulkTrackEditHistoryBatch } from "@/lib/library/track-history";

const fieldLabels: Record<string, { en: string; es: string }> = {
  album: { en: "Album", es: "Álbum" },
  bpm: { en: "BPM", es: "BPM" },
  comments: { en: "Comments", es: "Comentarios" },
  energy: { en: "Energy", es: "Energía" },
  genre: { en: "Genre", es: "Género" },
  multiple: { en: "Multiple fields", es: "Varios campos" },
  musical_key: { en: "Key", es: "Tonalidad" },
  rating: { en: "Rating", es: "Valoración" },
  release_year: { en: "Year", es: "Año" },
  subgenre: { en: "Subgenre", es: "Subgénero" },
};

function fieldLabel(field: string, en: boolean) {
  return fieldLabels[field]?.[en ? "en" : "es"] ?? field;
}

function previousValueLabel(value: unknown, en: boolean) {
  if (value === null || value === "") return en ? "empty" : "vacío";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return en ? "saved value" : "valor guardado";
}

function previousValuesSummary(batch: BulkTrackEditHistoryBatch, en: boolean) {
  const values = Array.isArray(batch.previous_values) ? batch.previous_values : [];
  if (!values.length) return en ? "No preview available" : "Sin vista previa disponible";
  const shown = values.map((value) => previousValueLabel(value, en)).join(", ");
  const remaining = Math.max(0, batch.previous_value_count - values.length);
  return remaining ? `${shown} +${remaining}` : shown;
}

export function BulkEditHistory({
  batches,
  locale,
  returnTo,
}: {
  batches: BulkTrackEditHistoryBatch[];
  locale: Locale;
  returnTo: string;
}) {
  if (!batches.length) return null;

  const en = locale === "en";
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section aria-labelledby="bulk-edit-history-title" className="card">
      <div className="organization-section-heading">
        <div>
          <p className="eyebrow">{en ? "Safety" : "Seguridad"}</p>
          <h2 id="bulk-edit-history-title">
            {en ? "Recent bulk edits" : "Ediciones masivas recientes"}
          </h2>
        </div>
        <span>{batches.length}</span>
      </div>

      <ul className="available-track-list">
        {batches.map((batch) => {
          const field = fieldLabel(batch.field_name, en);
          const previousValues = previousValuesSummary(batch, en);
          const confirmation = en
            ? `Undo this bulk edit for ${batch.track_count} tracks? ${field} will be restored to the previous saved values (${previousValues}). This consumes this undo record.`
            : `¿Deshacer esta edición masiva de ${batch.track_count} pistas? ${field} volverá a los valores anteriores guardados (${previousValues}). Esta acción consume este registro de deshacer.`;

          return (
            <li key={batch.batch_id}>
              <div>
                <strong>
                  {en
                    ? `${batch.track_count} tracks · ${field}`
                    : `${batch.track_count} pistas · ${field}`}
                </strong>
                <span>{dateFormatter.format(new Date(batch.created_at))}</span>
                <small>
                  {en ? "Previous values: " : "Valores anteriores: "}
                  {previousValues}
                </small>
                {batch.undone_at ? (
                  <small>{en ? "Already undone" : "Ya deshecha"}</small>
                ) : batch.can_undo ? (
                  <small>
                    {en
                      ? "Every track still matches this bulk edit."
                      : "Todas las pistas siguen siendo compatibles con esta edición."}
                  </small>
                ) : (
                  <small>
                    {en
                      ? "Cannot undo because at least one track changed or was removed afterwards."
                      : "No se puede deshacer porque al menos una pista cambió o se eliminó después."}
                  </small>
                )}
              </div>
              {batch.can_undo && !batch.undone_at ? (
                <form
                  action={undoBulkTrackEditAction}
                  onSubmit={(event) => {
                    if (!window.confirm(confirmation)) event.preventDefault();
                  }}
                >
                  <input name="batchId" type="hidden" value={batch.batch_id} />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <button className="button button--secondary" type="submit">
                    {en ? "Undo batch" : "Deshacer lote"}
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
