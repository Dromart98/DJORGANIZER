"use client";

import { useSearchParams } from "next/navigation";
import { undoManualCrateHistoryAction } from "@/app/crates/history-actions";
import type { Locale } from "@/lib/i18n/i18n";
import type { ManualCrateHistoryEntry } from "@/lib/organization/manual-crate-history";

function operationLabel(entry: ManualCrateHistoryEntry, locale: Locale) {
  const en = locale === "en";
  return {
    add: en ? "Track added" : "Pista añadida",
    merge: en ? "Crates merged" : "Crates fusionados",
    move: en ? "Order changed" : "Orden modificado",
    reconcile: en ? "VirtualDJ reconciliation" : "Reconciliación de VirtualDJ",
    remove: en ? "Track removed" : "Pista quitada",
    sort: en ? "Crate sorted" : "Crate ordenado",
  }[entry.change_kind];
}

export function ManualCrateHistory({
  crateId,
  entries,
  locale,
}: {
  crateId: string;
  entries: ManualCrateHistoryEntry[];
  locale: Locale;
}) {
  const en = locale === "en";
  const searchParams = useSearchParams();
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const undone = searchParams.get("historyUndone") === "1";
  const undoError = searchParams.get("historyUndoError");

  return (
    <section aria-labelledby="manual-crate-history-title" className="card">
      <div className="organization-section-heading">
        <div>
          <p className="eyebrow">{en ? "Safety" : "Seguridad"}</p>
          <h2 id="manual-crate-history-title">
            {en ? "Crate history" : "Historial del crate"}
          </h2>
        </div>
        <span>{entries.length}</span>
      </div>

      {undone ? (
        <p className="form-message form-message--success" role="status">
          {en
            ? "The crate change was undone."
            : "El cambio del crate se deshizo correctamente."}
        </p>
      ) : null}
      {undoError ? (
        <p className="form-message form-message--error" role="alert">
          {undoError === "changed"
            ? en
              ? "This change cannot be undone because the crate changed afterwards."
              : "No se puede deshacer este cambio porque el crate cambió después."
            : en
              ? "The crate change could not be undone."
              : "No se pudo deshacer el cambio del crate."}
        </p>
      ) : null}

      {entries.length ? (
        <ul className="available-track-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{operationLabel(entry, locale)}</strong>
                <span>
                  {en
                    ? `${entry.before_count} → ${entry.after_count} tracks`
                    : `${entry.before_count} → ${entry.after_count} pistas`}
                </span>
                <small>{dateFormatter.format(new Date(entry.created_at))}</small>
                {entry.undone_at ? (
                  <small>{en ? "Already undone" : "Ya deshecho"}</small>
                ) : entry.can_undo ? (
                  <small>
                    {en
                      ? "The crate still matches this change."
                      : "El crate sigue siendo compatible con este cambio."}
                  </small>
                ) : (
                  <small>
                    {en
                      ? "Cannot undo because the crate changed afterwards."
                      : "No se puede deshacer porque el crate cambió después."}
                  </small>
                )}
              </div>
              {entry.can_undo && !entry.undone_at ? (
                <form
                  action={undoManualCrateHistoryAction}
                  onSubmit={(event) => {
                    const message = en
                      ? `Restore the crate to its previous ${entry.before_count}-track order?`
                      : `¿Restaurar el crate a su orden anterior de ${entry.before_count} pistas?`;
                    if (!window.confirm(message)) event.preventDefault();
                  }}
                >
                  <input name="crateId" type="hidden" value={crateId} />
                  <input name="historyId" type="hidden" value={entry.id} />
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
            ? "There are no recorded manual crate changes yet."
            : "Todavía no hay cambios registrados en este crate manual."}
        </p>
      )}
    </section>
  );
}
