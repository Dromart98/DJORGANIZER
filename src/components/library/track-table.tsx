"use client";

import Link from "next/link";
import { useState } from "react";
import {
  assignTagToTracksAction,
  removeTagFromTracksAction,
} from "@/app/crates/actions";
import { deleteTracksAction } from "@/app/library/actions";
import { useTranslator } from "@/components/i18n/locale-provider";
import { BulkEditForm } from "@/components/library/bulk-edit-form";
import { DesktopExportLink } from "@/components/desktop/desktop-export-link";
import {
  formatDeleteTracksConfirmation,
  formatSelectedCount,
  formatMessage,
} from "@/lib/i18n/functional";
import {
  buildLibraryHref,
  type TrackQuery,
  type TrackSort,
} from "@/lib/library/track-query";
import { formatDuration } from "@/lib/tracks";
import type { Tables } from "@/types/database";
import type { TrackTagsByTrackId } from "@/lib/library/track-repository";

const columns: { key: TrackSort; label: string }[] = [
  { key: "title", label: "Título" },
  { key: "artist", label: "Artista" },
  { key: "bpm", label: "BPM" },
  { key: "key", label: "Tonalidad" },
  { key: "duration", label: "Duración" },
  { key: "created", label: "Añadida" },
  { key: "subgenre", label: "Subgénero" },
];

function displayDuration(value: number | null) {
  return value === null ? "—" : formatDuration(Math.round(value));
}

function sortHref(query: TrackQuery, sort: TrackSort) {
  const direction =
    query.sort === sort && query.direction === "asc" ? "desc" : "asc";
  return buildLibraryHref(query, { direction, page: 1, sort });
}

export function TrackTable({
  query,
  tags,
  trackTags,
  tracks,
}: {
  query: TrackQuery;
  tags: Pick<Tables<"tags">, "id" | "name">[];
  trackTags: TrackTagsByTrackId;
  tracks: Tables<"tracks">[];
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const { locale, t } = useTranslator();
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const allSelected =
    tracks.length > 0 && tracks.every((track) => selected.has(track.id));
  const returnTo = buildLibraryHref(query, {});

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(tracks.map((track) => track.id)));
  }

  function toggleTrack(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="bulk-toolbar">
        <span aria-atomic="true" role="status">
          {formatSelectedCount(locale, selected.size)}
        </span>
        <div className="bulk-actions">
          <DesktopExportLink request={{ trackIds: Array.from(selected) }} />
          <BulkEditForm
            returnTo={returnTo}
            selectedIds={Array.from(selected)}
          />
          {tags.length ? (
            <form className="bulk-tag-form">
              {Array.from(selected).map((id) => (
                <input key={id} name="trackId" type="hidden" value={id} />
              ))}
              <input name="returnTo" type="hidden" value={returnTo} />
              <select
                aria-label={t("Etiqueta para la selección")}
                disabled={selected.size === 0}
                name="tagId"
                required
              >
                <option value="">{t("Etiqueta…")}</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <button
                className="button button--secondary button--small"
                data-offline-action="tag-assign"
                disabled={selected.size === 0}
                formAction={assignTagToTracksAction}
                type="submit"
              >
                {t("Asignar")}
              </button>
              <button
                className="button button--secondary button--small"
                data-offline-action="tag-unassign"
                disabled={selected.size === 0}
                formAction={removeTagFromTracksAction}
                type="submit"
              >
                {t("Quitar")}
              </button>
            </form>
          ) : (
            <Link className="table-action" href="/crates">
              {t("Crear etiquetas")}
            </Link>
          )}
          <form
            action={deleteTracksAction}
            data-offline-action="track-delete"
            data-offline-confirm={formatDeleteTracksConfirmation(
              locale,
              selected.size,
            )}
            onSubmit={(event) => {
              if (
                !window.confirm(
                  formatDeleteTracksConfirmation(locale, selected.size),
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            {Array.from(selected).map((id) => (
              <input key={id} name="trackId" type="hidden" value={id} />
            ))}
            <button
              className="button button--danger button--small"
              disabled={selected.size === 0}
              type="submit"
            >
              {t("Eliminar selección")}
            </button>
          </form>
        </div>
      </div>

      <div className="table-wrap library-table">
        <table>
          <caption className="visually-hidden">{t("Biblioteca")}</caption>
          <thead>
            <tr>
              <th className="select-cell">
                <input
                  aria-label={t("Seleccionar todas las canciones de la página")}
                  checked={allSelected}
                  onChange={toggleAll}
                  type="checkbox"
                />
              </th>
              {columns.map((column) => (
                <th
                  aria-sort={
                    query.sort === column.key
                      ? query.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  key={column.key}
                >
                  <Link href={sortHref(query, column.key)}>
                    {t(column.label as Parameters<typeof t>[0])}
                    <span
                      aria-hidden="true"
                      className={`sort ${
                        query.sort === column.key ? "active" : ""
                      } ${
                        query.sort === column.key &&
                        query.direction === "desc"
                          ? "descending"
                          : ""
                      }`}
                    />
                  </Link>
                </th>
              ))}
              <th>{t("Género")}</th>
              <th>{t("Etiquetas")}</th>
              <th>Camelot</th>
              <th>{t("Energía")}</th>
              <th>{t("Valoración")}</th>
              <th>{t("Acciones")}</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => (
              <tr className={selected.has(track.id) ? "is-selected" : ""} key={track.id}>
                <td className="select-cell">
                  <input
                    aria-label={formatMessage(locale, "Seleccionar {name}", {
                      name: track.title,
                    })}
                    checked={selected.has(track.id)}
                    onChange={() => toggleTrack(track.id)}
                    type="checkbox"
                  />
                </td>
                <td>
                  <strong>{track.title}</strong>
                </td>
                <td>{track.artist ?? t("Artista desconocido")}</td>
                <td className="numeric">{track.bpm ?? "—"}</td>
                <td>{track.musical_key ?? "—"}</td>
                <td className="numeric muted">
                  {displayDuration(track.duration_seconds)}
                </td>
                <td className="muted">
                  {dateFormatter.format(new Date(track.created_at))}
                </td>
                <td>
                  <span className="genre">{track.genre ?? "—"}</span>
                </td>
                <td className="muted">{track.subgenre ?? "—"}</td>
                <td className="track-tags-cell">
                  <TagList tags={trackTags[track.id] ?? []} />
                </td>
                <td>
                  {track.camelot_key ? (
                    <span className="camelot">{track.camelot_key}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="numeric">{track.energy ?? "—"}</td>
                <td>{track.rating === null ? "—" : `${track.rating}/5`}</td>
                <td>
                  <Link
                    aria-label={`${t("Ver y editar")}: ${track.title}`}
                    className="table-action"
                    href={`/library/${track.id}`}
                  >
                    {t("Ver y editar")}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-track-list">
        {tracks.map((track) => (
          <article
            className={`mobile-track card ${
              selected.has(track.id) ? "is-selected" : ""
            }`}
            key={track.id}
          >
            <input
              aria-label={formatMessage(locale, "Seleccionar {name}", {
                name: track.title,
              })}
              checked={selected.has(track.id)}
              onChange={() => toggleTrack(track.id)}
              type="checkbox"
            />
            <div>
              <strong>{track.title}</strong>
              <span>{track.artist ?? t("Artista desconocido")}</span>
              <small>
                {track.bpm ? `${track.bpm} BPM` : "BPM —"} ·{" "}
                {track.musical_key ?? `${t("Tonalidad")} —`} ·{" "}
                {displayDuration(track.duration_seconds)}
              </small>
              <small>{track.genre ?? "—"}{track.subgenre ? ` · ${track.subgenre}` : ""}</small>
              <TagList tags={trackTags[track.id] ?? []} />
            </div>
            <Link
              aria-label={`${t("Editar")}: ${track.title}`}
              href={`/library/${track.id}`}
            >
              {t("Editar")}
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}

function TagList({ tags }: { tags: Pick<Tables<"tags">, "id" | "name">[] }) {
  return tags.length ? (
    <ul aria-label={tags.map((tag) => tag.name).join(", ")} className="track-tag-list">
      {tags.map((tag) => <li className="track-tag" key={tag.id}>{tag.name}</li>)}
    </ul>
  ) : <span className="muted">—</span>;
}
