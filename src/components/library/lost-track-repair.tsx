"use client";

import { useMemo, useState } from "react";
import {
  getLostTrackRepairEvidenceAction,
  type LostTrackRepairEvidence,
} from "@/app/library/health/repair/actions";
import styles from "@/app/library/health/repair/lost-track-repair.module.css";
import { useDesktopScanSession } from "@/components/desktop/scan-session-provider";
import type { Locale } from "@/lib/i18n/i18n";
import { getTauriCore } from "@/lib/desktop/tauri";

type RepairCandidate = {
  confidence: number;
  reasons: string[];
  relativePath: string;
  scanId: string;
};

type RepairTrackPreview = {
  candidates: RepairCandidate[];
  title: string;
  trackId: string;
};

type RepairPreview = {
  tracks: RepairTrackPreview[];
  unresolvedTrackIds: string[];
};

type RepairApplyResult = {
  links: Array<{ scanId: string; trackId: string }>;
};

const MAX_REPAIR_TRACKS = 25;

function reasonLabel(locale: Locale, reason: string) {
  const en = locale === "en";
  return (
    {
      album: en ? "Same album" : "Mismo álbum",
      artist: en ? "Same artist" : "Mismo artista",
      duration: en ? "Same duration" : "Misma duración",
      genre: en ? "Same genre" : "Mismo género",
      hash: en ? "Exact hash" : "Hash exacto",
      size: en ? "Compatible size" : "Tamaño compatible",
      title: en ? "Same title" : "Mismo título",
    }[reason] ?? reason
  );
}

export function LostTrackRepair({ locale }: { locale: Locale }) {
  const { missingTrackIds, repairTrackLinks, scanHealth } = useDesktopScanSession();
  const [preview, setPreview] = useState<RepairPreview | null>(null);
  const [serverUnresolved, setServerUnresolved] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const en = locale === "en";

  const selectedPairs = useMemo(
    () =>
      Object.entries(selected).map(([trackId, scanId]) => ({ trackId, scanId })),
    [selected],
  );

  async function prepare() {
    const core = getTauriCore();
    if (!core || !scanHealth || !missingTrackIds.length) return;
    setBusy(true);
    setMessage(null);
    setSelected({});
    try {
      const trackIds = missingTrackIds.slice(0, MAX_REPAIR_TRACKS);
      const evidence = await getLostTrackRepairEvidenceAction(trackIds);
      setServerUnresolved(evidence.unresolvedTrackIds);
      if (!evidence.tracks.length) {
        setPreview({ tracks: [], unresolvedTrackIds: [] });
        setMessage(
          en
            ? "These references do not have enough stored file evidence to propose a repair."
            : "Estas referencias no tienen suficiente evidencia de archivo guardada para proponer una reparación.",
        );
        return;
      }
      const result = await core.invoke<RepairPreview>("preview_lost_track_repairs", {
        libraryTracks: evidence.tracks satisfies LostTrackRepairEvidence[],
        sessionId: scanHealth.sessionId,
      });
      setPreview(result);
    } catch {
      setMessage(
        en
          ? "The repair preview could not be prepared. Refresh the folder and try again."
          : "No se pudo preparar la reparación. Actualiza la carpeta y vuelve a intentarlo.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const core = getTauriCore();
    if (!core || !scanHealth || !selectedPairs.length || !preview) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await core.invoke<RepairApplyResult>("apply_lost_track_repairs", {
        selections: selectedPairs,
        sessionId: scanHealth.sessionId,
      });
      const pathByPair = new Map(
        preview.tracks.flatMap((track) =>
          track.candidates.map((candidate) => [
            `${track.trackId}:${candidate.scanId}`,
            candidate.relativePath,
          ] as const),
        ),
      );
      repairTrackLinks(
        scanHealth.sessionId,
        result.links.map((link) => ({
          ...link,
          relativePath: pathByPair.get(`${link.trackId}:${link.scanId}`),
        })),
      );
      const repaired = new Set(result.links.map((link) => link.trackId));
      setPreview({
        ...preview,
        tracks: preview.tracks.filter((track) => !repaired.has(track.trackId)),
      });
      setSelected({});
      setMessage(
        en
          ? `${result.links.length} local references repaired. No audio file was modified.`
          : `${result.links.length} referencias locales reparadas. No se modificó ningún archivo de audio.`,
      );
    } catch {
      setMessage(
        en
          ? "The files or links changed after the preview. Nothing was repaired; prepare the preview again."
          : "Los archivos o vínculos cambiaron después de la previsualización. No se reparó nada; prepara de nuevo la propuesta.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!scanHealth) {
    return (
      <div className={`card ${styles.status}`}>
        <p>
          {en
            ? "Scan and then refresh the same music folder from the desktop app before repairing lost references."
            : "Escanea y después actualiza la misma carpeta de música desde la aplicación de escritorio antes de reparar referencias perdidas."}
        </p>
      </div>
    );
  }

  if (!missingTrackIds.length && !preview?.tracks.length) {
    return (
      <div className={`card ${styles.status}`}>
        <strong>{en ? "No lost references detected" : "No hay referencias perdidas detectadas"}</strong>
        <p className={styles.muted}>
          {en
            ? "A track is considered lost only after a previously linked relative path is positively absent from a refresh of the same folder."
            : "Una pista solo se considera perdida cuando una ruta relativa antes vinculada está positivamente ausente tras actualizar la misma carpeta."}
        </p>
      </div>
    );
  }

  const unresolvedCount =
    (preview?.unresolvedTrackIds.length ?? 0) + serverUnresolved.length;

  return (
    <div className={styles.intro}>
      <div className={`card ${styles.summary}`}>
        <div>
          <strong>
            {missingTrackIds.length.toLocaleString(locale)} {en ? "lost references" : "referencias perdidas"}
          </strong>
          <p className={styles.muted}>
            {en
              ? `Up to ${MAX_REPAIR_TRACKS} are reviewed per batch. Candidates are never applied automatically.`
              : `Se revisan hasta ${MAX_REPAIR_TRACKS} por lote. Los candidatos nunca se aplican automáticamente.`}
          </p>
        </div>
        <button
          className="button button--secondary"
          disabled={busy}
          onClick={prepare}
          type="button"
        >
          {busy
            ? en
              ? "Checking…"
              : "Comprobando…"
            : en
              ? "Find verified alternatives"
              : "Buscar alternativas verificables"}
        </button>
      </div>

      {message ? <p className="form-message" role="status">{message}</p> : null}
      {unresolvedCount ? (
        <p className="form-message" role="status">
          {en
            ? `${unresolvedCount} references do not currently have a sufficiently strong candidate.`
            : `${unresolvedCount} referencias no tienen ahora mismo un candidato suficientemente sólido.`}
        </p>
      ) : null}

      {preview?.tracks.length ? (
        <>
          <ul className={styles.trackList}>
            {preview.tracks.map((track) => (
              <li className={`card ${styles.trackCard}`} key={track.trackId}>
                <div>
                  <h3>{track.title}</h3>
                  <p className={styles.muted}>
                    {en
                      ? "Choose one alternative only if the evidence matches the track you expect."
                      : "Elige una alternativa solo si la evidencia corresponde a la pista esperada."}
                  </p>
                </div>
                <ul className={styles.candidateList}>
                  {track.candidates.map((candidate) => (
                    <li className={styles.candidate} key={candidate.scanId}>
                      <label className={styles.candidateLabel}>
                        <input
                          checked={selected[track.trackId] === candidate.scanId}
                          name={`repair-${track.trackId}`}
                          onChange={() =>
                            setSelected((current) => ({
                              ...current,
                              [track.trackId]: candidate.scanId,
                            }))
                          }
                          type="radio"
                        />
                        <span className={styles.path}>{candidate.relativePath}</span>
                        <strong className={styles.confidence}>
                          {candidate.confidence}%
                        </strong>
                      </label>
                      <div className={styles.reasonList}>
                        {candidate.reasons.map((reason) => (
                          <span className={styles.reason} key={reason}>
                            {reasonLabel(locale, reason)}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
                {selected[track.trackId] ? (
                  <button
                    className="button button--ghost button--small"
                    onClick={() =>
                      setSelected((current) => {
                        const next = { ...current };
                        delete next[track.trackId];
                        return next;
                      })
                    }
                    type="button"
                  >
                    {en ? "Leave unresolved" : "Dejar sin resolver"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className={styles.applyBar}>
            <span>
              {selectedPairs.length.toLocaleString(locale)} {en ? "repairs selected" : "reparaciones seleccionadas"}
            </span>
            <button
              className="button button--primary"
              disabled={busy || !selectedPairs.length}
              onClick={apply}
              type="button"
            >
              {en ? "Confirm selected repairs" : "Confirmar reparaciones seleccionadas"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
