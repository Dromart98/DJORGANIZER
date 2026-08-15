"use client";

import { undoTrackTagHistoryAction } from "@/app/library/tag-history-actions";
import type { Locale } from "@/lib/i18n/i18n";
import type { TrackTagHistoryEntry } from "@/lib/library/tag-history";

export function TagHistory({
  entries,
  locale,
  returnTo,
}: {
  entries: TrackTagHistoryEntry[];
  locale: Locale;
  returnTo: string;
}) {
  const en = locale === "en";
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section aria-labelledby="tag-history-title" className="card">
      <div className="organization-section-heading">
        <div>
          <p className="eyebrow">{en ? "Safety" : "Seguridad"}</p>
          <h2 id="tag-history-title">{en ? "Tag history" : "Historial de etiquetas"}</h2>
        </div>
        <span>{entries.length}</span>
      </div>

      {entries.length ? (
        <ul className="available-track-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.tag_name}</strong>
                <span>
                  {entry.operation === "add"
                    ? en
                      ? `Assigned to ${entry.track_count} track${entry.track_count === 1 ? "" : "s"}`
                      : `Asignada a ${entry.track_count} pista${entry.track_count === 1 ? "" : "s"}`
                    : en
                      ? `Removed from ${entry.track_count} track${entry.track_count === 1 ? "" : "s"}`
                      : `Quitada de ${entry.track_count} pista${entry.track_count === 1 ? "" : "s"}`}
                </span>
                <small>{dateFormatter.format(new Date(entry.created_at))}</small>
                {entry.undone_at ? (
                  <small>{en ? "Already undone" : "Ya deshecho"}</small>
                ) : entry.can_undo ? (
                  <small>{en ? "Current tag state still matches this change." : "El estado actual de las etiquetas sigue siendo compatible con este cambio."}</small>
                ) : (
                  <small>{en ? "Cannot undo because the tag or track state changed afterwards." : "No se puede deshacer porque la etiqueta o las pistas cambiaron después."}</small>
                )}
              </div>
              {entry.can_undo && !entry.undone_at ? (
                <form
                  action={undoTrackTagHistoryAction}
                  onSubmit={(event) => {
                    const message =
                      entry.operation === "add"
                        ? en
                          ? `Remove ${entry.tag_name} from the ${entry.track_count} affected track${entry.track_count === 1 ? "" : "s"}?`
                          : `¿Quitar ${entry.tag_name} de las ${entry.track_count} pistas afectadas?`
                        : en
                          ? `Restore ${entry.tag_name} to the ${entry.track_count} affected track${entry.track_count === 1 ? "" : "s"}?`
                          : `¿Restaurar ${entry.tag_name} en las ${entry.track_count} pistas afectadas?`;
                    if (!window.confirm(message)) event.preventDefault();
                  }}
                >
                  <input name="historyId" type="hidden" value={entry.id} />
                  <input name="returnTo" type="hidden" value={returnTo} />
                  <button className="button button--secondary" type="submit">
                    {en ? "Undo" : "Deshacer"}
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="organization-muted">
          {en ? "There are no recorded tag changes yet." : "Todavía no hay cambios de etiquetas registrados."}
        </p>
      )}
    </section>
  );
}
