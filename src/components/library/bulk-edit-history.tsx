import { undoBulkTrackEditAction } from "@/app/library/actions";
import type { Locale } from "@/lib/i18n/i18n";
import type { BulkTrackEditHistoryBatch } from "@/lib/library/track-history";

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
        {batches.map((batch) => (
          <li key={batch.batch_id}>
            <div>
              <strong>
                {en
                  ? `${batch.track_count} tracks`
                  : `${batch.track_count} pistas`}
              </strong>
              <span>{dateFormatter.format(new Date(batch.created_at))}</span>
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
                    ? "Cannot undo because at least one track changed afterwards."
                    : "No se puede deshacer porque al menos una pista cambió después."}
                </small>
              )}
            </div>
            {batch.can_undo && !batch.undone_at ? (
              <form action={undoBulkTrackEditAction}>
                <input name="batchId" type="hidden" value={batch.batch_id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <button className="button button--secondary" type="submit">
                  {en ? "Undo batch" : "Deshacer lote"}
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
