"use client";

import { useMemo, useState } from "react";
import { formatDuration, sortTracks } from "@/lib/tracks";
import type { SortDirection, Track, TrackSortKey } from "@/types/music";

const columns: { key: TrackSortKey; label: string }[] = [
  { key: "title", label: "Título" }, { key: "artist", label: "Artista" }, { key: "genre", label: "Género" }, { key: "bpm", label: "BPM" }, { key: "key", label: "Tonalidad" }, { key: "camelot", label: "Camelot" }, { key: "durationSeconds", label: "Duración" },
];

export function TrackTable({ tracks }: { tracks: readonly Track[] }) {
  const [sortKey, setSortKey] = useState<TrackSortKey>("title");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const sorted = useMemo(() => sortTracks(tracks, sortKey, direction), [tracks, sortKey, direction]);
  function changeSort(key: TrackSortKey) { if (key === sortKey) setDirection((value) => value === "asc" ? "desc" : "asc"); else { setSortKey(key); setDirection("asc"); } }
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key}><button onClick={() => changeSort(column.key)} aria-label={`Ordenar por ${column.label}`}>{column.label}<span className={sortKey === column.key ? "sort active" : "sort"}>{sortKey === column.key && direction === "desc" ? "↓" : "↑"}</span></button></th>)}</tr></thead><tbody>{sorted.map((track) => <tr key={track.id}><td><strong>{track.title}</strong></td><td>{track.artist}</td><td><span className="genre">{track.genre}</span></td><td className="numeric">{track.bpm}</td><td>{track.key}</td><td><span className="camelot">{track.camelot}</span></td><td className="numeric muted">{formatDuration(track.durationSeconds)}</td></tr>)}</tbody></table></div>;
}

