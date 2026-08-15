import { undoTrackEditAction } from "@/app/library/actions";
import type { Locale } from "@/lib/i18n/i18n";
import type { TrackEditHistoryEntry } from "@/lib/library/track-history";

function logicalFieldLabels(fields: string[], locale: Locale) {
  const en = locale === "en";
  const labels = new Set<string>();

  for (const field of fields) {
    if (field === "title") labels.add(en ? "Title" : "Título");
    else if (field === "artist") labels.add(en ? "Artist" : "Artista");
    else if (field === "album") labels.add(en ? "Album" : "Álbum");
    else if (field === "genre" || field.startsWith("genre_")) {
      labels.add(en ? "Genre" : "Género");
    } else if (field === "subgenre" || field.startsWith("subgenre_")) {
      labels.add(en ? "Subgenre" : "Subgénero");
    } else if (field === "bpm" || field.startsWith("bpm_")) {
      labels.add("BPM");
    } else if (
      field === "musical_key" ||
      field === "camelot_key" ||
      field.startsWith("key_")
    ) {
      labels.add(en ? "Key" : "Tonalidad");
    } else if (field === "energy" || field.startsWith("energy_")) {
      labels.add(en ? "Energy" : "Energía");
    } else if (field === "rating") {
      labels.add(en ? "Rating" : "Valoración");
    } else if (field === "release_year") {
      labels.add(en ? "Year" : "Año");
    } else if (field === "duration_seconds") {
      labels.add(en ? "Duration" : "Duración");
    } else if (field === "comments") {
      labels.add(en ? "Comments" : "Comentarios");
    }
  }

  return [...labels];
}

export function TrackEditHistory({
  entries,
  locale,
  trackId,
}: {
  entries: TrackEditHistoryEntry[];
  locale: Locale;
  trackId: string;
}) {
  const en = locale === "en";
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section aria-labelledby="track-edit-history-title" className="card">
      <div className="organization-section-heading">
        <div>
          <p className="eyebrow">{en ? "Safety" : "Seguridad"}</p>
          <h2 id="track-edit-history-title">
            {en ? "Edit history" : "Historial de edición"}
          </h2>
        </div>
        <span>{entries.length}</span>
      </div>

      {entries.length ? (
        <ul className="available-track-list">
          {entries.map((entry) => {
            const labels = logicalFieldLabels(entry.changed_fields, locale);
            return (
              <li key={entry.id}>
                <div>
                  <strong>
                    {labels.length
                      ? labels.join(" · ")
                      : en
                        ? "Track fields"
                        : "Campos de la pista"}
                  </strong>
                  <span>{dateFormatter.format(new Date(entry.created_at))}</span>
                  {entry.undone_at ? (
                    <small>{en ? "Already undone" : "Ya deshecho"}</small>
                  ) : entry.can_undo ? (
                    <small>
                      {en
                        ? "The track still matches this edit."
                        : "La pista sigue siendo compatible con esta edición."}
                    </small>
                  ) : (
                    <small>
                      {en
                        ? "Cannot undo because the track changed afterwards."
                        : "No se puede deshacer porque la pista cambió después."}
                    </small>
                  )}
                </div>
                {entry.can_undo && !entry.undone_at ? (
                  <form action={undoTrackEditAction}>
                    <input name="historyId" type="hidden" value={entry.id} />
                    <input name="trackId" type="hidden" value={trackId} />
                    <button className="button button--secondary" type="submit">
                      {en ? "Undo" : "Deshacer"}
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="organization-muted">
          {en
            ? "There are no recorded edits yet."
            : "Todavía no hay ediciones registradas."}
        </p>
      )}
    </section>
  );
}
