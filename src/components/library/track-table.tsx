"use client";

import Link from "next/link";
import { useState } from "react";
import {
  assignTagToTracksAction,
  removeTagFromTracksAction,
} from "@/app/crates/actions";
import { deleteTracksAction } from "@/app/library/actions";
import { BulkEditForm } from "@/components/library/bulk-edit-form";
import {
  buildLibraryHref,
  type TrackQuery,
  type TrackSort,
} from "@/lib/library/track-query";
import { formatDuration } from "@/lib/tracks";
import type { Tables } from "@/types/database";

const columns: { key: TrackSort; label: string }[] = [
  { key: "title", label: "Título" },
  { key: "artist", label: "Artista" },
  { key: "bpm", label: "BPM" },
  { key: "key", label: "Tonalidad" },
  { key: "duration", label: "Duración" },
  { key: "created", label: "Añadida" },
];

const dateFormatter = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
});

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
  tracks,
}: {
  query: TrackQuery;
  tags: Pick<Tables<"tags">, "id" | "name">[];
  tracks: Tables<"tracks">[];
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
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
        <span>{selected.size} seleccionadas</span>
        <div className="bulk-actions">
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
                aria-label="Etiqueta para la selección"
                disabled={selected.size === 0}
                name="tagId"
                required
              >
                <option value="">Etiqueta…</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
              <button
                className="button button--secondary button--small"
                disabled={selected.size === 0}
                formAction={assignTagToTracksAction}
                type="submit"
              >
                Asignar
              </button>
              <button
                className="button button--secondary button--small"
                disabled={selected.size === 0}
                formAction={removeTagFromTracksAction}
                type="submit"
              >
                Quitar
              </button>
            </form>
          ) : (
            <Link className="table-action" href="/crates">
              Crear etiquetas
            </Link>
          )}
          <form
            action={deleteTracksAction}
            onSubmit={(event) => {
              if (
                !window.confirm(
                  `¿Eliminar ${selected.size} ${
                    selected.size === 1 ? "canción" : "canciones"
                  }? Esta acción no se puede deshacer.`,
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
              Eliminar selección
            </button>
          </form>
        </div>
      </div>

      <div className="table-wrap library-table">
        <table>
          <thead>
            <tr>
              <th className="select-cell">
                <input
                  aria-label="Seleccionar todas las canciones de la página"
                  checked={allSelected}
                  onChange={toggleAll}
                  type="checkbox"
                />
              </th>
              {columns.map((column) => (
                <th key={column.key}>
                  <Link href={sortHref(query, column.key)}>
                    {column.label}
                    <span
                      className={
                        query.sort === column.key ? "sort active" : "sort"
                      }
                    >
                      {query.sort === column.key && query.direction === "desc"
                        ? "↓"
                        : "↑"}
                    </span>
                  </Link>
                </th>
              ))}
              <th>Género</th>
              <th>Camelot</th>
              <th>Energía</th>
              <th>Valoración</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => (
              <tr key={track.id}>
                <td className="select-cell">
                  <input
                    aria-label={`Seleccionar ${track.title}`}
                    checked={selected.has(track.id)}
                    onChange={() => toggleTrack(track.id)}
                    type="checkbox"
                  />
                </td>
                <td>
                  <strong>{track.title}</strong>
                </td>
                <td>{track.artist}</td>
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
                  <Link className="table-action" href={`/library/${track.id}`}>
                    Ver y editar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mobile-track-list">
        {tracks.map((track) => (
          <article className="mobile-track card" key={track.id}>
            <input
              aria-label={`Seleccionar ${track.title}`}
              checked={selected.has(track.id)}
              onChange={() => toggleTrack(track.id)}
              type="checkbox"
            />
            <div>
              <strong>{track.title}</strong>
              <span>{track.artist}</span>
              <small>
                {track.bpm ? `${track.bpm} BPM` : "BPM —"} ·{" "}
                {track.musical_key ?? "Tonalidad —"} ·{" "}
                {displayDuration(track.duration_seconds)}
              </small>
            </div>
            <Link href={`/library/${track.id}`}>Editar</Link>
          </article>
        ))}
      </div>
    </>
  );
}
