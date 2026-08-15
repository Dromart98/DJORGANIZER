"use client";

import { undoTrackArchiveHistoryAction } from "@/app/library/archive-history-actions";
import type { Locale } from "@/lib/i18n/i18n";
import type { TrackArchiveHistoryEntry } from "@/lib/library/archive-history";

export function ArchiveHistory({
  entries,
  locale,
  returnTo,
}: {
  entries: TrackArchiveHistoryEntry[];
  locale: Locale;
  returnTo: string;
}) {
  const en = locale === "en";
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section aria-labelledby="archive-history-title" className="card">
      <div className="organization-section-heading">
        <div>
          <p className="eyebrow">{en ? "Safety" : "Seguridad"}</p>
          <h2 id="archive-history-title">
            {en ? "Archive history" : "Historial de archivado"}
          </h2>
        </div>
        <span>{entries.length}</span>
      </div>

      {entries.length ? (
        <ul className="available-track-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.track_title}</strong>
                <span>
                  {entry.operation === "archive"
                    ? en
                      ? "Archived"
                      : "Archivada"
                    : en
                      ? "Restored"
                      : "Restaurada"}
                </span>
                <small>{dateFormatter.format(new Date(entry.created_at))}</small>
                {entry.undone_at ? (
                  <small>{en ? "Already undone" : "Ya deshecho"}</small>
                ) : entry.can_undo ? (
                  <small>
                    {en
                      ? "The current archive state still matches this change."
                      : "El estado actual de archivado sigue siendo compatible con este cambio."}
                  </small>
                ) : (
                  <small>
                    {en
                      ? "Cannot undo because the track archive state changed afterwards."
                      : "No se puede deshacer porque el estado de archivado cambió después."}
                  </small>
                )}
              </div>
              {entry.can_undo && !entry.undone_at ? (
                <form
                  action={undoTrackArchiveHistoryAction}
                  onSubmit={(event) => {
                    const message =
                      entry.operation === "archive"
                        ? en
                          ? `Restore “${entry.track_title}” to the active library?`
                          : `¿Restaurar “${entry.track_title}” a la biblioteca activa?`
                        : en
                          ? `Archive “${entry.track_title}” again?`
                          : `¿Archivar “${entry.track_title}” de nuevo?`;
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
          {en
            ? "There are no recorded archive changes yet."
            : "Todavía no hay cambios de archivado registrados."}
        </p>
      )}
    </section>
  );
}
