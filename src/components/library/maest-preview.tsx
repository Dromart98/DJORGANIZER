"use client";

import { useEffect, useRef, useState } from "react";
import { useDesktopScanSession } from "@/components/desktop/scan-session-provider";
import { useTranslator } from "@/components/i18n/locale-provider";
import {
  createMaestPreviewState,
  invokeMaestPreview,
  invokeMaestCancel,
  startMaestProgressPolling,
  cleanupMaestPreviewOperation,
  isMaestCancellation,
  maestFormProposal,
  maestSurfaceVisibility,
  maestErrorMessage,
  maestProgressText,
  maestPollingRequest,
  maestGenreWriteAvailability,
  maestSubgenreWriteAvailability,
  invokeMaestGenreWrite,
  invokeMaestGenreWritePreview,
  invokeMaestSubgenreWrite,
  invokeMaestSubgenreWritePreview,
  metadataWriteErrorMessage,
  reduceMaestPreviewState,
  sameMaestLink,
  type MaestLinkIdentity,
  type MaestPreviewAction,
  type MaestFormProposal,
} from "@/lib/desktop/maest-preview";
import { getTauriCore } from "@/lib/desktop/tauri";
import type { Tables } from "@/types/database";
import { cancelNativeTrackAnalysis, invokeNativeTrackAnalysis, nativeTrackProposal, type NativeTrackProposal } from "@/lib/desktop/track-analysis";

export function MaestPreview({
  formGenre,
  formSubgenre,
  formValues,
  onApply,
  onApplyNative,
  track,
}: {
  formGenre: string;
  formSubgenre: string;
  formValues: { bpm: string; musicalKey: string; camelotKey: string; energy: string };
  onApply: (proposal: MaestFormProposal) => void;
  onApplyNative: (proposal: NativeTrackProposal) => void;
  track: Tables<"tracks">;
}) {
  const trackId = track.id;
  const { getTrackLink } = useDesktopScanSession();
  const { locale } = useTranslator();
  const link = getTrackLink(trackId);
  const [desktopAvailable, setDesktopAvailable] = useState(false);
  const sessionId = link?.sessionId ?? null;
  const scanId = link?.scanId ?? null;
  const identity: MaestLinkIdentity | null =
    sessionId && scanId ? { scanId, sessionId, trackId } : null;
  const [state, setState] = useState(() => createMaestPreviewState(identity));
  const [applied, setApplied] = useState(false);
  const [nativeProposal, setNativeProposal] = useState<NativeTrackProposal | null>(null);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [nativePhase, setNativePhase] = useState<"idle" | "analyzing" | "cancelling">("idle");
  const nativeOperation = useRef<{ operationId: string; sessionId: string; scanId: string } | null>(null);
  const analysisSnapshot = useRef({ ...formValues, genre: formGenre, subgenre: formSubgenre });
  const latestForm = useRef({ ...formValues, genre: formGenre, subgenre: formSubgenre });
  latestForm.current = { ...formValues, genre: formGenre, subgenre: formSubgenre };
  const [selected, setSelected] = useState({ bpm: true, key: true, energy: true, genre: true, subgenre: true });
  const [writePreview, setWritePreview] = useState<Awaited<ReturnType<typeof invokeMaestGenreWritePreview>> | null>(null);
  const [writePhase, setWritePhase] = useState<"idle" | "previewing" | "writing" | "undoing">("idle");
  const [writeMessage, setWriteMessage] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [writeRunId, setWriteRunId] = useState<string | null>(null);
  const [subgenreWritePreview, setSubgenreWritePreview] = useState<Awaited<ReturnType<typeof invokeMaestSubgenreWritePreview>> | null>(null);
  const [subgenreWriteRunId, setSubgenreWriteRunId] = useState<string | null>(null);
  const writeBusyRef = useRef(false);
  const writeIdentity = `${trackId}\u0000${sessionId ?? ""}\u0000${scanId ?? ""}\u0000${formGenre}\u0000${formSubgenre}`;
  const writeIdentityRef = useRef(writeIdentity);
  writeIdentityRef.current = writeIdentity;
  const stateRef = useRef(state);
  stateRef.current = state;
  const requestCounter = useRef(0);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const mountedRef = useRef(false);

  function transition(action: MaestPreviewAction) {
    const synchronized = reduceMaestPreviewState(stateRef.current, {
      type: "linkChanged",
      identity: currentIdentity.current,
    });
    const next = reduceMaestPreviewState(synchronized, action);
    stateRef.current = next;
    setState(next);
    return next;
  }

  useEffect(() => {
    setDesktopAvailable(Boolean(getTauriCore()));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const core = getTauriCore();
      if (core) {
        cleanupMaestPreviewOperation(core, stateRef.current);
        const nativeRequest = nativeOperation.current;
        if (nativeRequest) void cancelNativeTrackAnalysis(core, nativeRequest.sessionId, nativeRequest.scanId, nativeRequest.operationId);
      }
    };
  }, []);

  useEffect(() => {
    const core = getTauriCore();
    if (core) cleanupMaestPreviewOperation(core, stateRef.current);
    const nativeRequest = nativeOperation.current;
    if (core && nativeRequest) void cancelNativeTrackAnalysis(core, nativeRequest.sessionId, nativeRequest.scanId, nativeRequest.operationId);
    transition({ type: "linkChanged", identity });
    setApplied(false);
    setNativeProposal(null);
    setNativeError(null);
    nativeOperation.current = null;
    setNativePhase("idle");
    // `identity` is deliberately represented by its opaque primitive parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, sessionId, trackId]);

  useEffect(() => {
    setWritePreview(null);
    setWriteMessage(null);
    setWriteError(null);
    setWriteRunId(null);
    setSubgenreWritePreview(null);
    setSubgenreWriteRunId(null);
  }, [formGenre, formSubgenre, scanId, sessionId, trackId]);

  const pollingRequest = maestPollingRequest(state);
  useEffect(() => {
    if (!pollingRequest) return;
    const core = getTauriCore();
    if (!core) return;
    return startMaestProgressPolling(core, pollingRequest, (progress) => {
      transition({ type: "progress", request: pollingRequest, progress });
    });
    // The exact immutable request identity owns this polling loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingRequest?.operationId, pollingRequest?.requestId, pollingRequest?.scanId, pollingRequest?.sessionId, pollingRequest?.trackId]);

  async function analyze() {
    if (!sessionId || !scanId) return;
    setApplied(false);
    setNativeError(null);
    setNativeProposal(null);
    analysisSnapshot.current = latestForm.current;
    const requestId = ++requestCounter.current;
    const started = transition({ type: "start", requestId });
    const request = started.activeRequest;
    if (!request || request.requestId !== requestId || started.phase !== "preparing") return;
    const core = getTauriCore();
    if (!core) {
      transition({
        type: "failed",
        request,
        error: locale === "en" ? "Track analysis is available in the desktop app." : "El análisis de pistas está disponible en la aplicación de escritorio.",
      });
      return;
    }

    const nativeOperationId = crypto.randomUUID();
    nativeOperation.current = { operationId: nativeOperationId, sessionId, scanId };
    setNativePhase("analyzing");
    try {
      const nativeResult = await invokeNativeTrackAnalysis(core, sessionId, scanId, nativeOperationId);
      if (!mountedRef.current || nativeOperation.current?.operationId !== nativeOperationId || !sameMaestLink(identity, currentIdentity.current)) return;
      setNativeProposal(nativeTrackProposal(nativeResult, scanId));
    } catch (caught) {
      if (isMaestCancellation(caught)) {
        setNativePhase("idle");
        transition({ type: "cancelled", request });
        return;
      }
      setNativeError(maestErrorMessage(caught, locale));
    } finally {
      if (nativeOperation.current?.operationId === nativeOperationId) {
        nativeOperation.current = null;
        setNativePhase("idle");
      }
    }
    if (!mountedRef.current || !sameMaestLink(identity, currentIdentity.current)) return;

    try {
      const requestIsCurrent = () => {
        const current = stateRef.current.activeRequest;
        return Boolean(mountedRef.current && current && current.requestId === request.requestId && sameMaestLink(current, currentIdentity.current));
      };
      const result = await invokeMaestPreview(
        core,
        sessionId,
        scanId,
        request.operationId,
        () => {
          if (!requestIsCurrent()) return false;
          transition({ type: "prepared", request });
          return true;
        },
        () => {
          if (!requestIsCurrent()) return false;
          transition({ type: "armed", request });
          return true;
        },
      );
      if (result && mountedRef.current) transition({ type: "succeeded", request, result });
    } catch (caught) {
      if (!mountedRef.current) return;
      if (isMaestCancellation(caught)) {
        transition({ type: "cancelled", request });
        return;
      }
      transition({
        type: "failed",
        request,
        error: maestErrorMessage(caught, locale),
      });
    }
  }

  async function cancelAnalysis() {
    const nativeRequest = nativeOperation.current;
    if (nativeRequest) {
      const core = getTauriCore();
      if (!core) return;
      setNativePhase("cancelling");
      try { await cancelNativeTrackAnalysis(core, nativeRequest.sessionId, nativeRequest.scanId, nativeRequest.operationId); } catch { /* analysis owns its result */ }
      return;
    }
    const request = stateRef.current.activeRequest;
    if (!request || stateRef.current.phase !== "analyzing") return;
    const core = getTauriCore();
    if (!core) return;
    const cancelling = transition({ type: "cancelRequested", request });
    if (cancelling.phase !== "cancelling") return;
    try { await invokeMaestCancel(core, request); } catch { /* Original analysis owns the final state. */ }
  }

  const visibleState = sameMaestLink(state.identity, identity)
    ? state
    : createMaestPreviewState(identity);
  const { error, phase, progress, proposal } = visibleState;
  const surface = maestSurfaceVisibility(desktopAvailable, identity);
  if (surface === "hidden") return null;
  const isBusy = phase !== "idle" || nativePhase !== "idle";
  const genre = proposal?.analysis.genre;
  const subgenre = proposal?.analysis.subgenre;
  const formProposal = maestFormProposal(proposal);

  function applyToForm() {
    const current = latestForm.current;
    const snapshot = analysisSnapshot.current;
    if (formProposal) onApply({
      genre: selected.genre && current.genre === snapshot.genre ? formProposal.genre : null,
      subgenre: selected.subgenre && current.subgenre === snapshot.subgenre ? formProposal.subgenre : null,
    });
    if (nativeProposal) onApplyNative({
      bpm: selected.bpm && current.bpm === snapshot.bpm ? nativeProposal.bpm : null,
      key: selected.key && current.musicalKey === snapshot.musicalKey && current.camelotKey === snapshot.camelotKey ? nativeProposal.key : null,
      energy: selected.energy && current.energy === snapshot.energy ? nativeProposal.energy : null,
    });
    setApplied(true);
  }

  const writeAvailability = maestGenreWriteAvailability(track, formGenre, Boolean(identity));
  const subgenreWriteAvailability = maestSubgenreWriteAvailability(track, formSubgenre, Boolean(identity));
  const writeBusy = writePhase !== "idle";

  async function previewGenreWrite() {
    if (!sessionId || !scanId || writeAvailability !== "available" || writeBusyRef.current) return;
    const core = getTauriCore();
    if (!core) return;
    const requestedIdentity = writeIdentity;
    writeBusyRef.current = true;
    setWritePhase("previewing");
    setWriteError(null);
    setWriteMessage(null);
    try {
      const next = await invokeMaestGenreWritePreview(core, sessionId, scanId, formGenre);
      if (writeIdentityRef.current !== requestedIdentity) return;
      setWritePreview(next);
      setWriteMessage(next.changed
        ? locale === "en" ? "Review the current and new genre, then confirm the write." : "Revisa el género actual y el nuevo antes de confirmar la escritura."
        : locale === "en" ? "The file already has this genre. No backup or write is needed." : "El archivo ya tiene este género. No se necesita copia ni escritura.");
    } catch (error) {
      setWritePreview(null);
      setWriteError(metadataWriteErrorMessage(error, locale));
    } finally {
      writeBusyRef.current = false;
      setWritePhase("idle");
    }
  }

  async function writeGenre() {
    if (!sessionId || !scanId || !writePreview?.changed || writeBusyRef.current) return;
    const core = getTauriCore();
    if (!core) return;
    const requestedIdentity = writeIdentity;
    writeBusyRef.current = true;
    setWritePhase("writing");
    setWriteError(null);
    try {
      const result = await invokeMaestGenreWrite(core, sessionId, scanId, formGenre);
      if (writeIdentityRef.current !== requestedIdentity) return;
      setWritePreview(null);
      setWriteRunId(result.runId);
      setWriteMessage(locale === "en" ? "Genre written and verified." : "Género escrito y verificado.");
    } catch (error) {
      setWriteError(metadataWriteErrorMessage(error, locale));
    } finally {
      writeBusyRef.current = false;
      setWritePhase("idle");
    }
  }

  async function undoGenreWrite() {
    if (!sessionId || !writeRunId || writeBusyRef.current) return;
    const core = getTauriCore();
    if (!core) return;
    const requestedIdentity = writeIdentity;
    writeBusyRef.current = true;
    setWritePhase("undoing");
    setWriteError(null);
    try {
      await core.invoke("undo_maest_genre_write", { sessionId, runId: writeRunId });
      if (writeIdentityRef.current !== requestedIdentity) return;
      setWriteRunId(null);
      setWriteMessage(locale === "en" ? "The file was restored from its backup." : "El archivo se restauró desde su copia de seguridad.");
    } catch (error) {
      setWriteError(metadataWriteErrorMessage(error, locale));
    } finally {
      writeBusyRef.current = false;
      setWritePhase("idle");
    }
  }

  async function previewSubgenreWrite() {
    if (!sessionId || !scanId || subgenreWriteAvailability !== "available" || writeBusyRef.current) return;
    const core = getTauriCore();
    if (!core) return;
    const requestedIdentity = writeIdentity;
    writeBusyRef.current = true;
    setWritePhase("previewing");
    setWriteError(null);
    setWriteMessage(null);
    try {
      const next = await invokeMaestSubgenreWritePreview(core, sessionId, scanId, formSubgenre);
      if (writeIdentityRef.current !== requestedIdentity) return;
      setSubgenreWritePreview(next);
      setWriteMessage(next.changed
        ? locale === "en" ? "Review the current and new subgenre, then confirm the write." : "Revisa el subgénero actual y el nuevo antes de confirmar la escritura."
        : locale === "en" ? "The file already has this subgenre. No backup or write is needed." : "El archivo ya tiene este subgénero. No se necesita copia ni escritura.");
    } catch (error) {
      setSubgenreWritePreview(null);
      setWriteError(metadataWriteErrorMessage(error, locale));
    } finally {
      writeBusyRef.current = false;
      setWritePhase("idle");
    }
  }

  async function writeSubgenre() {
    if (!sessionId || !scanId || !subgenreWritePreview?.changed || writeBusyRef.current) return;
    const core = getTauriCore();
    if (!core) return;
    const requestedIdentity = writeIdentity;
    writeBusyRef.current = true;
    setWritePhase("writing");
    setWriteError(null);
    try {
      const result = await invokeMaestSubgenreWrite(core, sessionId, scanId, formSubgenre);
      if (writeIdentityRef.current !== requestedIdentity) return;
      setSubgenreWritePreview(null);
      setSubgenreWriteRunId(result.runId);
      setWriteMessage(locale === "en" ? "Subgenre written and verified." : "Subgénero escrito y verificado.");
    } catch (error) {
      setWriteError(metadataWriteErrorMessage(error, locale));
    } finally {
      writeBusyRef.current = false;
      setWritePhase("idle");
    }
  }

  async function undoSubgenreWrite() {
    if (!sessionId || !subgenreWriteRunId || writeBusyRef.current) return;
    const core = getTauriCore();
    if (!core) return;
    writeBusyRef.current = true;
    setWritePhase("undoing");
    setWriteError(null);
    try {
      await core.invoke("undo_maest_genre_write", { sessionId, runId: subgenreWriteRunId });
      setSubgenreWriteRunId(null);
      setWriteMessage(locale === "en" ? "The file was restored from its backup." : "El archivo se restauró desde su copia de seguridad.");
    } catch (error) {
      setWriteError(metadataWriteErrorMessage(error, locale));
    } finally {
      writeBusyRef.current = false;
      setWritePhase("idle");
    }
  }

  return (
    <section aria-labelledby="maest-preview-title" className="maest-preview">
      <div className="maest-preview__heading">
        <div>
          <p className="eyebrow">{locale === "en" ? "Read-only proposal" : "Propuesta sin aplicar"}</p>
          <h2 id="maest-preview-title">{locale === "en" ? "Track analysis" : "Análisis de pista"}</h2>
        </div>
        {surface === "linked" ? (
          <div className="form-actions">
          <button className="button button--secondary" disabled={isBusy} onClick={analyze} type="button">
            {phase === "preparing"
              ? locale === "en" ? "Preparing analyzer…" : "Preparando analizador…"
              : phase === "starting"
                ? locale === "en" ? "Preparing analyzer…" : "Preparando analizador…"
              : phase === "analyzing"
                ? locale === "en" ? "Analyzing track…" : "Analizando pista…"
                : proposal
                  ? locale === "en" ? "Analyze again" : "Volver a analizar"
                  : locale === "en" ? "Analyze track" : "Analizar pista"}
          </button>
          {nativePhase !== "idle" || phase === "analyzing" || phase === "cancelling" ? (
            <button className="button button--secondary" disabled={phase === "cancelling"} onClick={cancelAnalysis} type="button">
              {phase === "cancelling" ? (locale === "en" ? "Cancelling analysis…" : "Cancelando análisis…") : (locale === "en" ? "Cancel analysis" : "Cancelar análisis")}
            </button>
          ) : null}
          </div>
        ) : null}
      </div>
      {surface === "unlinked" ? (
        <p className="organization-muted" role="status">
          {locale === "en" ? "Link this track to the active local scan before analyzing it." : "Vincula primero esta pista con el escaneo local activo para analizarla."}
        </p>
      ) : null}
      {isBusy ? (
        <p aria-live="polite" className="organization-muted">
            {nativePhase === "analyzing" ? (locale === "en" ? "Analyzing BPM, key and energy…" : "Analizando BPM, tonalidad y energía…")
            : nativePhase === "cancelling" ? (locale === "en" ? "Cancelling analysis…" : "Cancelando análisis…")
            : phase === "preparing"
            ? locale === "en" ? "Preparing analysis. The first preparation may download about 348 MB." : "Preparando el análisis. La primera preparación puede descargar unos 348 MB."
            : phase === "starting" ? (locale === "en" ? "Preparing analysis…" : "Preparando el análisis…")
            : phase === "cancelling" ? (locale === "en" ? "Cancelling analysis…" : "Cancelando análisis…")
            : maestProgressText(progress, locale)}
        </p>
      ) : null}
      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
      {nativeError ? <p className="form-message form-message--error" role="alert">{nativeError}</p> : null}
      {proposal || nativeProposal ? (
        <div className="maest-proposal" aria-live="polite">
          <dl>
            {nativeProposal?.bpm ? <div><dt><input checked={selected.bpm} onChange={(e) => setSelected((s) => ({...s,bpm:e.target.checked}))} type="checkbox" /> BPM</dt><dd>{track.bpm ?? "—"} → {nativeProposal.bpm.value} ({Math.round(nativeProposal.bpm.confidence * 100)}%)</dd></div> : null}
            {nativeProposal?.key ? <div><dt><input checked={selected.key} onChange={(e) => setSelected((s) => ({...s,key:e.target.checked}))} type="checkbox" /> {locale === "en" ? "Key / Camelot" : "Tonalidad / Camelot"}</dt><dd>{track.musical_key ?? "—"} / {track.camelot_key ?? "—"} → {nativeProposal.key.value} / {nativeProposal.key.camelotValue} ({Math.round(nativeProposal.key.confidence * 100)}%)</dd></div> : null}
            {nativeProposal?.energy ? <div><dt><input checked={selected.energy} onChange={(e) => setSelected((s) => ({...s,energy:e.target.checked}))} type="checkbox" /> {locale === "en" ? "Energy" : "Energía"}</dt><dd>{track.energy ?? "—"} → {nativeProposal.energy.value} ({Math.round(nativeProposal.energy.confidence * 100)}%)</dd></div> : null}
            {genre?.proposedValue ? <div><dt><input checked={selected.genre} onChange={(e) => setSelected((s) => ({...s,genre:e.target.checked}))} type="checkbox" /> {locale === "en" ? "Genre" : "Género"}</dt><dd>{track.genre ?? "—"} → {genre.proposedValue}</dd></div> : null}
            {subgenre?.proposedValue ? <div><dt><input checked={selected.subgenre} onChange={(e) => setSelected((s) => ({...s,subgenre:e.target.checked}))} type="checkbox" /> {locale === "en" ? "Subgenre" : "Subgénero"}</dt><dd>{track.subgenre ?? "—"} → {subgenre.proposedValue}</dd></div> : null}
          </dl>
          <div className="form-actions">
            {formProposal || nativeProposal ? (
              <button className="button button--primary button--small" onClick={applyToForm} type="button">
                {locale === "en" ? "Apply to form" : "Aplicar al formulario"}
              </button>
            ) : null}
            <button className="button button--secondary button--small" onClick={() => { transition({ type: "discard" }); setNativeProposal(null); }} type="button">
              {locale === "en" ? "Discard proposal" : "Descartar propuesta"}
            </button>
          </div>
        </div>
      ) : null}
      {applied ? (
        <p aria-live="polite" className="form-message form-message--success" role="status">
          {locale === "en"
            ? "Proposal applied to the form. Review it before saving changes."
            : "Propuesta aplicada al formulario. Revísala antes de guardar los cambios."}
        </p>
      ) : null}
      {writeAvailability !== "unavailable" ? (
        <section aria-labelledby="maest-genre-write-title" className="maest-proposal">
          <h3 id="maest-genre-write-title">{locale === "en" ? "Genre in local file" : "Género en el archivo local"}</h3>
          {writeAvailability === "needs-save" ? (
            <p className="organization-muted" role="status">{locale === "en" ? "Save the form changes before writing the persisted genre." : "Guarda primero los cambios del formulario para escribir el género persistido."}</p>
          ) : (
            <div className="form-actions">
              <button className="button button--secondary button--small" disabled={writeBusy} onClick={previewGenreWrite} type="button">
                {writePhase === "previewing" ? (locale === "en" ? "Previewing…" : "Previsualizando…") : (locale === "en" ? "Preview write" : "Previsualizar escritura")}
              </button>
              {writePreview?.changed ? (
                <button className="button button--primary button--small" disabled={writeBusy} onClick={writeGenre} type="button">
                  {writePhase === "writing" ? (locale === "en" ? "Writing…" : "Escribiendo…") : (locale === "en" ? "Write genre to file" : "Escribir género en archivo")}
                </button>
              ) : null}
              {writeRunId ? (
                <button className="button button--secondary button--small" disabled={writeBusy} onClick={undoGenreWrite} type="button">
                  {writePhase === "undoing" ? (locale === "en" ? "Undoing…" : "Deshaciendo…") : (locale === "en" ? "Undo write" : "Deshacer escritura")}
                </button>
              ) : null}
            </div>
          )}
          {writePreview?.changed ? <dl><div><dt>{locale === "en" ? "Current genre" : "Género actual"}</dt><dd>{writePreview.before ?? "—"}</dd></div><div><dt>{locale === "en" ? "New genre" : "Género nuevo"}</dt><dd>{writePreview.after}</dd></div></dl> : null}
          {writeMessage ? <p aria-live="polite" className="form-message form-message--success" role="status">{writeMessage}</p> : null}
          {writeError ? <p className="form-message form-message--error" role="alert">{writeError}</p> : null}
        </section>
      ) : null}
      {subgenreWriteAvailability !== "unavailable" ? (
        <section aria-labelledby="maest-subgenre-write-title" className="maest-proposal">
          <h3 id="maest-subgenre-write-title">{locale === "en" ? "Subgenre in local file" : "Subgénero en el archivo local"}</h3>
          {subgenreWriteAvailability === "needs-save" ? (
            <p className="organization-muted" role="status">{locale === "en" ? "Save the form changes before writing the persisted subgenre." : "Guarda primero los cambios del formulario para escribir el subgénero persistido."}</p>
          ) : (
            <div className="form-actions">
              <button className="button button--secondary button--small" disabled={writeBusy} onClick={previewSubgenreWrite} type="button">
                {writePhase === "previewing" ? (locale === "en" ? "Previewing…" : "Previsualizando…") : (locale === "en" ? "Preview subgenre write" : "Previsualizar escritura de subgénero")}
              </button>
              {subgenreWritePreview?.changed ? (
                <button className="button button--primary button--small" disabled={writeBusy} onClick={writeSubgenre} type="button">
                  {writePhase === "writing" ? (locale === "en" ? "Writing…" : "Escribiendo…") : (locale === "en" ? "Write subgenre to file" : "Escribir subgénero en archivo")}
                </button>
              ) : null}
              {subgenreWriteRunId ? (
                <button className="button button--secondary button--small" disabled={writeBusy} onClick={undoSubgenreWrite} type="button">
                  {writePhase === "undoing" ? (locale === "en" ? "Undoing…" : "Deshaciendo…") : (locale === "en" ? "Undo write" : "Deshacer escritura")}
                </button>
              ) : null}
            </div>
          )}
          {subgenreWritePreview?.changed ? <dl><div><dt>{locale === "en" ? "Current subgenre" : "Subgénero actual"}</dt><dd>{subgenreWritePreview.before ?? "—"}</dd></div><div><dt>{locale === "en" ? "New subgenre" : "Subgénero nuevo"}</dt><dd>{subgenreWritePreview.after}</dd></div></dl> : null}
        </section>
      ) : null}
    </section>
  );
}
