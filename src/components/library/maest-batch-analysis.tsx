"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { applyMaestBatchProposalsAction } from "@/app/library/maest-actions";
import { useDesktopScanSession } from "@/components/desktop/scan-session-provider";
import { useTranslator } from "@/components/i18n/locale-provider";
import { MAX_MAEST_BATCH_TRACKS, MaestBatchOrchestrator, maestBatchActionDisabled, maestBatchActionVisible, type MaestBatchState, type MaestBatchTrack } from "@/lib/desktop/maest-batch";
import { maestFormProposal, maestProgressText } from "@/lib/desktop/maest-preview";
import { getTauriCore } from "@/lib/desktop/tauri";

type ReviewField = "genre" | "subgenre";
type ReviewSelection = Record<string, { genre: boolean; subgenre: boolean }>;
type ApplyResult = Awaited<ReturnType<typeof applyMaestBatchProposalsAction>>;

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
  const [reviewSelection, setReviewSelection] = useState<ReviewSelection>({});
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
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
    if (!batchTracks.length || busy || preparationSettling || applying) return;
    if (batchTracks.length > MAX_MAEST_BATCH_TRACKS) { setLimitError(true); setOpen(true); return; }
    const core = getTauriCore();
    if (!core) return;
    setLimitError(false);
    setOpen(true);
    setReviewSelection({});
    setApplyResult(null);
    const orchestrator = new MaestBatchOrchestrator({ core, tracks: batchTracks, getTrackLink: (id) => getTrackLinkRef.current(id), includeAnalyzed, locale, onState: setState, onPreparationSettlingChange: (settling) => { if (mountedRef.current) setPreparationSettling(settling); } });
    orchestratorRef.current = orchestrator;
    void orchestrator.run();
  }
  async function cancelBatch() { await orchestratorRef.current?.cancel(); }
  function closeResults() { orchestratorRef.current?.dispose(); orchestratorRef.current = null; setState(null); setReviewSelection({}); setApplyResult(null); setOpen(false); }
  function retryFailed() {
    if (!state) return;
    startBatch(state.items.filter((item) => item.status === "failed").map(({ trackId, title, artist, evidence }) => ({ trackId, title, artist, evidence })));
  }
  function toggleReview(trackId: string, field: ReviewField) {
    setApplyResult(null);
    setReviewSelection((current) => ({
      ...current,
      [trackId]: {
        genre: current[trackId]?.genre ?? false,
        subgenre: current[trackId]?.subgenre ?? false,
        [field]: !(current[trackId]?.[field] ?? false),
      },
    }));
  }

  const counts = state?.items.reduce((result, item) => {
    if (item.status === "completed") result.completed += 1;
    else if (item.status === "failed") result.failed += 1;
    else if (["skipped", "already_analyzed"].includes(item.status)) result.skipped += 1;
    else if (["pending", "preparing", "analyzing"].includes(item.status)) result.pending += 1;
    return result;
  }, { completed: 0, skipped: 0, failed: 0, pending: 0 });

  const applyRequestItems = state?.items.flatMap((item) => {
    if (item.status !== "completed" || !item.result) return [];
    const proposal = maestFormProposal(item.result);
    if (!proposal) return [];
    const selection = reviewSelection[item.trackId];
    const genre = selection?.genre && proposal.genre
      ? { expectedValue: item.evidence.genre.value, evidence: proposal.genre }
      : undefined;
    const subgenre = selection?.subgenre && proposal.subgenre
      ? { expectedValue: item.evidence.subgenre.value, evidence: proposal.subgenre }
      : undefined;
    return genre || subgenre ? [{ trackId: item.trackId, ...(genre ? { genre } : {}), ...(subgenre ? { subgenre } : {}) }] : [];
  }) ?? [];
  const selectedFieldCount = applyRequestItems.reduce((total, item) => total + (item.genre ? 1 : 0) + (item.subgenre ? 1 : 0), 0);
  const applyByTrack = new Map(applyResult?.items.map((item) => [item.trackId, item]) ?? []);

  async function applySelected() {
    if (!applyRequestItems.length || applying || busy) return;
    const confirmed = window.confirm(locale === "en"
      ? `Apply ${selectedFieldCount} selected MAEST proposal${selectedFieldCount === 1 ? "" : "s"} across ${applyRequestItems.length} track${applyRequestItems.length === 1 ? "" : "s"}?`
      : `¿Aplicar ${selectedFieldCount} propuesta${selectedFieldCount === 1 ? "" : "s"} MAEST seleccionada${selectedFieldCount === 1 ? "" : "s"} en ${applyRequestItems.length} pista${applyRequestItems.length === 1 ? "" : "s"}?`);
    if (!confirmed) return;
    setApplying(true);
    try {
      const result = await applyMaestBatchProposalsAction({ items: applyRequestItems });
      if (!mountedRef.current) return;
      setApplyResult(result);
      setReviewSelection({});
      if (
        result.items.some(
          (item) => item.genre === "applied" || item.subgenre === "applied",
        )
      ) {
        router.refresh();
      }
    } finally {
      if (mountedRef.current) setApplying(false);
    }
  }

  return <div className="maest-batch">
    <button className="button button--secondary button--small" disabled={maestBatchActionDisabled(tracks.length, Boolean(busy), preparationSettling) || applying} onClick={() => startBatch()} type="button">{locale === "en" ? "Analyze genre and subgenre" : "Analizar género y subgénero"}</button>
    {open ? <section aria-label={locale === "en" ? "Batch genre and subgenre analysis" : "Análisis de género y subgénero por lote"} className="maest-batch__panel">
      <label className="maest-batch__option"><input checked={includeAnalyzed} disabled={busy || applying} onChange={(event) => setIncludeAnalyzed(event.target.checked)} type="checkbox" />{locale === "en" ? "Re-analyze already classified tracks" : "Volver a analizar las ya clasificadas"}</label>
      {limitError ? <p className="form-message form-message--error" role="alert">{locale === "en" ? "Select no more than 25 tracks." : "Selecciona como máximo 25 pistas."}</p> : null}
      {applyResult?.status === "invalid" ? <p className="form-message form-message--error" role="alert">{locale === "en" ? "The selected proposals were rejected as invalid." : "Las propuestas seleccionadas se rechazaron por no ser válidas."}</p> : null}
      {state ? <>
        <div aria-live="polite">
          {state.phase === "preparing-model" ? <p>{locale === "en" ? "Preparing analyzer…" : "Preparando analizador…"}</p> : null}
          {state.phase === "running" && state.currentEligibleOrdinal !== null ? <p>{locale === "en" ? `Analyzing track ${state.currentEligibleOrdinal} of ${state.eligibleTotal}` : `Analizando ${state.currentEligibleOrdinal} de ${state.eligibleTotal} pistas`}</p> : null}
          {state.progress ? <p>{maestProgressText(state.progress, locale)}</p> : null}
          {counts ? <p>{locale === "en" ? `Completed: ${counts.completed} · Skipped: ${counts.skipped} · Failed: ${counts.failed} · Pending: ${counts.pending}` : `Completadas: ${counts.completed} · Omitidas: ${counts.skipped} · Fallidas: ${counts.failed} · Pendientes: ${counts.pending}`}</p> : null}
        </div>
        {state.error ? <p className="form-message form-message--error" role="alert">{state.error}</p> : null}
        <ul className="maest-batch__results">{state.items.map((item) => {
          const proposal = item.result ? maestFormProposal(item.result) : null;
          const applied = applyByTrack.get(item.trackId);
          return <li key={item.trackId}>
            <strong>{item.title}</strong><span>{item.artist ?? (locale === "en" ? "Unknown artist" : "Artista desconocido")}</span><span>{batchStatus(item.status, locale)}</span>
            {proposal?.genre ? <label className="maest-batch__option"><input checked={reviewSelection[item.trackId]?.genre ?? false} disabled={Boolean(busy) || applying} onChange={() => toggleReview(item.trackId, "genre")} type="checkbox" />{locale === "en" ? "Apply genre" : "Aplicar género"}: {item.evidence.genre.value ?? "—"} → {proposal.genre.value}</label> : null}
            {proposal?.subgenre ? <label className="maest-batch__option"><input checked={reviewSelection[item.trackId]?.subgenre ?? false} disabled={Boolean(busy) || applying} onChange={() => toggleReview(item.trackId, "subgenre")} type="checkbox" />{locale === "en" ? "Apply subgenre" : "Aplicar subgénero"}: {item.evidence.subgenre.value ?? "—"} → {proposal.subgenre.value}</label> : null}
            {applied ? <span role="status">{locale === "en" ? `Apply result: ${applyStatus(applied.status, locale)} · Genre: ${applyStatus(applied.genre, locale)} · Subgenre: ${applyStatus(applied.subgenre, locale)}` : `Resultado: ${applyStatus(applied.status, locale)} · Género: ${applyStatus(applied.genre, locale)} · Subgénero: ${applyStatus(applied.subgenre, locale)}`}</span> : null}
            {item.error ? <span className="form-message--error">{item.error}</span> : null}
          </li>;
        })}</ul>
      </> : null}
      <div className="form-actions">
        {busy ? <button className="button button--secondary button--small" onClick={cancelBatch} type="button">{locale === "en" ? "Cancel batch" : "Cancelar lote"}</button> : null}
        {!busy && applyRequestItems.length ? <button className="button button--primary button--small" disabled={applying} onClick={applySelected} type="button">{applying ? (locale === "en" ? "Applying proposals…" : "Aplicando propuestas…") : (locale === "en" ? "Apply selected proposals" : "Aplicar propuestas seleccionadas")}</button> : null}
        {state?.items.some((item) => item.status === "failed") && !busy ? <button className="button button--secondary button--small" disabled={applying} onClick={retryFailed} type="button">{locale === "en" ? "Retry failed" : "Reintentar fallidas"}</button> : null}
        {!busy ? <button className="button button--secondary button--small" disabled={applying} onClick={closeResults} type="button">{locale === "en" ? "Close results" : "Cerrar resultados"}</button> : null}
      </div>
    </section> : null}
  </div>;
}

function batchStatus(status: MaestBatchState["items"][number]["status"], locale: "es" | "en") {
  const labels = locale === "en"
    ? { pending: "Pending", preparing: "Preparing", analyzing: "Analyzing", completed: "Completed", failed: "Failed", cancelled: "Cancelled", skipped: "Skipped", already_analyzed: "Already analyzed" }
    : { pending: "Pendiente", preparing: "Preparando", analyzing: "Analizando", completed: "Completada", failed: "Fallida", cancelled: "Cancelada", skipped: "Omitida", already_analyzed: "Ya analizada" };
  return labels[status];
}

function applyStatus(status: "applied" | "omitted" | "conflict" | "failed", locale: "es" | "en") {
  const labels = locale === "en"
    ? { applied: "Applied", omitted: "Omitted", conflict: "Conflict", failed: "Failed" }
    : { applied: "Aplicado", omitted: "Omitido", conflict: "Conflicto", failed: "Fallido" };
  return labels[status];
}
