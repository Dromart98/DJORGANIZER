"use client";

import Link from "next/link";
import {
  assignTagToTracksAction,
  removeTagFromTracksAction,
} from "@/app/crates/actions";
import { useTranslator } from "@/components/i18n/locale-provider";
import type { TrackTag } from "@/lib/library/track-repository";

export function TrackTags({
  assignedTags,
  availableTags,
  trackId,
  trackTitle,
}: {
  assignedTags: TrackTag[];
  availableTags: TrackTag[];
  trackId: string;
  trackTitle: string;
}) {
  const { t } = useTranslator();
  const assignedIds = new Set(assignedTags.map((tag) => tag.id));
  const unassignedTags = availableTags.filter((tag) => !assignedIds.has(tag.id));
  const returnTo = `/library/${trackId}`;

  return (
    <section aria-labelledby="track-tags-title" className="card track-tags-panel">
      <div>
        <p className="eyebrow">{t("Etiqueta reutilizable")}</p>
        <h2 id="track-tags-title">{t("Etiquetas")}</h2>
      </div>
      {assignedTags.length ? (
        <ul className="track-tag-list track-tag-list--editable">
          {assignedTags.map((tag) => (
            <li className="track-tag" key={tag.id}>
              <span>{tag.name}</span>
              <form action={removeTagFromTracksAction}>
                <input name="tagId" type="hidden" value={tag.id} />
                <input name="trackId" type="hidden" value={trackId} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <button
                  aria-label={`${t("Quitar etiqueta")} ${tag.name} ${t("de")} ${trackTitle}`}
                  className="track-tag__remove"
                  data-offline-action="tag-unassign"
                  type="submit"
                >
                  ×
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="organization-muted">{t("Esta canción aún no tiene etiquetas.")}</p>
      )}
      {availableTags.length ? (
        unassignedTags.length ? (
          <form action={assignTagToTracksAction} className="track-tag-assign-form">
            <input name="trackId" type="hidden" value={trackId} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <label className="field">
              <span>{t("Asignar etiqueta")}</span>
              <select name="tagId" required>
                {unassignedTags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
            </label>
            <button className="button button--secondary" data-offline-action="tag-assign" type="submit">
              {t("Asignar")}
            </button>
          </form>
        ) : null
      ) : (
        <p className="organization-muted">
          {t("Crea etiquetas reutilizables en Crates para clasificar tus canciones.")} {" "}
          <Link className="table-action" href="/crates">{t("Crear etiquetas")}</Link>
        </p>
      )}
    </section>
  );
}
