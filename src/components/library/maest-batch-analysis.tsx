"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { applyMaestBatchAction } from "@/app/library/actions";
import { useDesktopScanSession } from "@/components/desktop/scan-session-provider";
import { useTranslator } from "@/components/i18n/locale-provider";
import { MAX_MAEST_BATCH_TRACKS, MaestBatchOrchestrator, maestBatchActionDisabled, maestBatchActionVisible, type MaestBatchState, type MaestBatchTrack } from "@/lib/desktop/maest-batch";
import { maestFormProposal, maestProgressText } from "@/lib/desktop/maest-preview";
import type { MaestBatchApplicationResult } from "@/lib/library/maest-batch-apply";
import { getTauriCore } from "@/lib/desktop/tauri";

export function MaestBatchAnalysis({ tracks }: { tracks: MaestBatchTrack[] }) {
  const { getTrackLink } = useDesktopScanSession();
  const { locale } = useTranslator();
  const router = useRouter();
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [includeAnalyzed, setIncludeAnalyzed] = useState(false);
  const [state, setState] = useState<MaestBatchState | null>(null);
  const [limitError, setLimitError] = useState(false);
  const [preparationSettling, setPreparationSettling] = useState(false);
  const [selected, setSelected] = useState<Record<string, { genre: boolean; subgenre: boolean }>>({});
  const [applicationResults, setApplicationResults] = useState<MaestBatchApplicationResult[]>([]);
  const [applying, setApplying] = useState(false);
  const orchestratorRef = useRef<MaestBatchOrchestrator | null>(null);
  const getTrackLinkRef = useRef(getTrackLink);
  getTrackLinkRef.current = getTrackLink;
  useEffect(() => setDesktopAvailable(Boolean(getTauriCore())), []);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; orchestratorRef.current?.dispose(); };
  }, []);
  if (!maestBatchActionVisible(desktopAvailable)) return null;
  const busy = state?.phase === "preparing-model" || state?.phase === "running";

  function startBatch(batchTracks = tracks) {
    if (!batchTracks.length || busy || preparationSettling) return;
    if (batchTracks.length > MAX_MAEST_BATCH_TRACKS) { setLimitError(true); setOpen(true); return; }
    const core = getTauriCore();
    if (!core) return;
    setLimitError(false); setOpen(true);
    setSelected({}); setApplicationResults([]);
    const orchestrator = new MaestBatchOrchestrator({ core, tracks: batchTracks, getTrackLink: (id) => getTrackLinkRef.current(id), includeAnalyzed, locale, onState: setState, onPreparationSettlingChange: (settling) => { if (mountedRef.current) setPreparationSettling(settling); } });
    orchestratorRef.current = orchestrator;
    void orchestrator.run();
  }
  async function cancelBatch() { await orchestratorRef.current?.cancel(); }
  function closeResults() { orchestratorRef.current?.dispose(); orchestratorRef.current = null; setState(null); setOpen(false); }
  function retryFailed() {
    if (!state) return;
    startBatch(state.items.filter((item) => item.status === "failed").map(({ trackId, title, artist, evidence }) => ({ trackId, title, artist, evidence })));
  }
  function toggleField(trackId: string, field: "genre" | "subgenre", checked: boolean) {
    setSelected((current) => ({ ...current, [trackId]: { genre: current[trackId]?.genre ?? false, subgenre: current[trackId]?.subgenre ?? false, [field]: checked } }));
  }
  async function applySelected() {
    if (!state || applying) return;
    const payload = state.items.flatMap((item) => {
      if (item.status !== "completed") return [];
      const proposal = maestFormProposal(item.result ?? null);
      const choice = selected[item.trackId];
      if (!proposal || !choice || (!choice.genre && !choice.subgenre)) return [];
      const fields = {
        ...(choice.genre && proposal.genre ? { genre: proposal.genre } : {}),
        ...(choice.subgenre && proposal.subgenre ? { subgenre: proposal.subgenre } : {}),
      };
      if (!fields.genre && !fields.subgenre) return [];
      return [{ trackId: item.trackId, expected: { genre: item.evidence.genre.value, subgenre: item.evidence.subgenre.value }, fields }];
    });
    if (!payload.length) return;
    const confirmed = window.confirm(locale === "en" ? `Save the selected proposals for ${payload.length} tracks?` : `¿Guardar las propuestas seleccionadas de ${payload.length} pistas?`);
    if (!confirmed) return;
    setApplying(true);
    try {
      const results = await applyMaestBatchAction(payload);
      setApplicationResults(results);
      router.refresh();
    } finally { setApplying(false); }
  }
  const counts = state?.items.reduce((result, item) => {
    if (item.status === "completed") result.completed += 1;
    else if (item.status === "failed") result.failed += 1;
    else if (["skipped", "already_analyzed"].includes(item.status)) result.skipped += 1;
    else if (["pending", "preparing", "analyzing"].includes(item.status)) result.pending += 1;
    return result;
  }, { completed: 0, skipped: 0, failed: 0, pending: 0 });

  return <div className="maest-batch">
    <button className="button button--secondary button--small" disabled={maestBatchActionDisabled(tracks.length, Boolean(busy), preparationSettling)} onClick={() => startBatch()} type="button">{locale === "en" ? "Analyze genre and subgenre" : "Analizar género y subgénero"}</button>
    {open ? <section aria-label={locale === "en" ? "Batch genre and subgenre analysis" : "Análisis de género y subgénero por lote"} className="maest-batch__panel">
      <label className="maest-batch__option"><input checked={includeAnalyzed} disabled={busy} onChange={(event) => setIncludeAnalyzed(event.target.checked)} type="checkbox" />{locale === "en" ? "Re-analyze already classified tracks" : "Volver a analizar las ya clasificadas"}</label>
      {limitError ? <p className="form-message form-message--error" role="alert">{locale === "en" ? "Select no more than 25 tracks." : "Selecciona como máximo 25 pistas."}</p> : null}
      {state ? <>
        <div aria-live="polite">
          {state.phase === "preparing-model" ? <p>{locale === "en" ? "Preparing analyzer…" : "Preparando analizador…"}</p> : null}
          {state.phase === "running" && state.currentEligibleOrdinal !== null ? <p>{locale === "en" ? `Analyzing track ${state.currentEligibleOrdinal} of ${state.eligibleTotal}` : `Analizando ${state.currentEligibleOrdinal} de ${state.eligibleTotal} pistas`}</p> : null}
          {state.progress ? <p>{maestProgressText(state.progress, locale)}</p> : null}
          {counts ? <p>{locale === "en" ? `Completed: ${counts.completed} · Skipped: ${counts.skipped} · Failed: ${counts.failed} · Pending: ${counts.pending}` : `Completadas: ${counts.completed} · Omitidas: ${counts.skipped} · Fallidas: ${counts.failed} · Pendientes: ${counts.pending}`}</p> : null}
        </div>
        {state.error ? <p className="form-message form-message--error" role="alert">{state.error}</p> : null}
        <ul className="maest-batch__results">{state.items.map((item) => {
          const proposal = item.status === "completed" ? maestFormProposal(item.result ?? null) : null;
          const application = applicationResults.find((result) => result.trackId === item.trackId);
          return <li key={item.trackId}>
          <strong>{item.title}</strong><span>{item.artist ?? (locale === "en" ? "Unknown artist" : "Artista desconocido")}</span><span>{batchStatus(item.status, locale)}</span>
          {proposal?.genre ? <label><input checked={selected[item.trackId]?.genre ?? false} disabled={applying || Boolean(application)} onChange={(event) => toggleField(item.trackId, "genre", event.target.checked)} type="checkbox" /> {locale === "en" ? "Genre" : "Género"}: {item.evidence.genre.value || "—"} → <strong>{proposal.genre.value}</strong></label> : null}
          {proposal?.subgenre ? <label><input checked={selected[item.trackId]?.subgenre ?? false} disabled={applying || Boolean(application)} onChange={(event) => toggleField(item.trackId, "subgenre", event.target.checked)} type="checkbox" /> {locale === "en" ? "Subgenre" : "Subgénero"}: {item.evidence.subgenre.value || "—"} → <strong>{proposal.subgenre.value}</strong></label> : null}
          {application ? <span role="status">{applicationStatus(application.status, locale)}</span> : null}
          {item.error ? <span className="form-message--error">{item.error}</span> : null}
        </li>; })}</ul>
      </> : null}
      <div className="form-actions">
        {busy ? <button className="button button--secondary button--small" onClick={cancelBatch} type="button">{locale === "en" ? "Cancel batch" : "Cancelar lote"}</button> : null}
        {state?.items.some((item) => item.status === "failed") && !busy ? <button className="button button--secondary button--small" onClick={retryFailed} type="button">{locale === "en" ? "Retry failed" : "Reintentar fallidas"}</button> : null}
        {state?.phase === "completed" && state.items.some((item) => item.status === "completed") ? <button className="button button--primary button--small" disabled={applying || !Object.values(selected).some((choice) => choice.genre || choice.subgenre)} onClick={applySelected} type="button">{applying ? (locale === "en" ? "Saving…" : "Guardando…") : (locale === "en" ? "Save selected proposals" : "Guardar propuestas seleccionadas")}</button> : null}
        {!busy ? <button className="button button--secondary button--small" onClick={closeResults} type="button">{locale === "en" ? "Close results" : "Cerrar resultados"}</button> : null}
      </div>
    </section> : null}
  </div>;
}

function applicationStatus(status: MaestBatchApplicationResult["status"], locale: "es" | "en") {
  const labels = locale === "en" ? { applied: "Applied", omitted: "Skipped", conflict: "Conflict: the current value changed", failed: "Could not apply" } : { applied: "Aplicada", omitted: "Omitida", conflict: "Conflicto: cambió el valor actual", failed: "No se pudo aplicar" };
  return labels[status];
}

function batchStatus(status: MaestBatchState["items"][number]["status"], locale: "es" | "en") {
  const labels = locale === "en"
    ? { pending: "Pending", preparing: "Preparing", analyzing: "Analyzing", completed: "Completed", failed: "Failed", cancelled: "Cancelled", skipped: "Skipped", already_analyzed: "Already analyzed" }
    : { pending: "Pendiente", preparing: "Preparando", analyzing: "Analizando", completed: "Completada", failed: "Fallida", cancelled: "Cancelada", skipped: "Omitida", already_analyzed: "Ya analizada" };
  return labels[status];
}
