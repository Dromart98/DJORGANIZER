"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { applyMaestBatchProposalsAction } from "@/app/library/maest-actions";
import { createPostAnalysisCrateAction } from "@/app/library/post-analysis-actions";
import { useDesktopScanSession } from "@/components/desktop/scan-session-provider";
import { useTranslator } from "@/components/i18n/locale-provider";
import {
  MAX_MAEST_BATCH_TRACKS,
  MaestBatchOrchestrator,
  maestBatchActionDisabled,
  maestBatchActionVisible,
  type MaestBatchState,
  type MaestBatchTrack,
} from "@/lib/desktop/maest-batch";
import { DESKTOP_EXPORT_REQUEST_KEY } from "@/lib/desktop/export-request";
import {
  maestFormProposal,
  maestProgressText,
} from "@/lib/desktop/maest-preview";
import {
  EMPTY_POST_ANALYSIS_SUMMARY,
  mergePostAnalysisSummaries,
  summarizePostAnalysis,
  type PostAnalysisSummary,
} from "@/lib/desktop/post-analysis-summary";
import { getTauriCore } from "@/lib/desktop/tauri";

type ReviewField = "genre" | "subgenre";
type ReviewSelection = Record<string, { genre: boolean; subgenre: boolean }>;
type ApplyResult = Awaited<ReturnType<typeof applyMaestBatchProposalsAction>>;
type CreateCrateResult = Awaited<ReturnType<typeof createPostAnalysisCrateAction>>;

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
  const [crateName, setCrateName] = useState(
    locale === "en" ? "Analyzed selection" : "Selección analizada",
  );
  const [crateResult, setCrateResult] = useState<CreateCrateResult | null>(null);
  const [creatingCrate, setCreatingCrate] = useState(false);
  const [retainedPostAnalysisTrackIds, setRetainedPostAnalysisTrackIds] =
    useState<string[]>([]);
  const [retainedPostAnalysisSummary, setRetainedPostAnalysisSummary] =
    useState<PostAnalysisSummary>({ ...EMPTY_POST_ANALYSIS_SUMMARY });
  const orchestratorRef = useRef<MaestBatchOrchestrator | null>(null);
  const getTrackLinkRef = useRef(getTrackLink);
  getTrackLinkRef.current = getTrackLink;
  useEffect(() => setDesktopAvailable(Boolean(getTauriCore())), []);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      orchestratorRef.current?.dispose();
    };
  }, []);
  if (!maestBatchActionVisible(desktopAvailable)) return null;
  const busy = state?.phase === "preparing-model" || state?.phase === "running";

  function startBatch(
    batchTracks = tracks,
    preservePostAnalysisResults = false,
  ) {
    if (!batchTracks.length || busy || preparationSettling || applying) return;
    if (batchTracks.length > MAX_MAEST_BATCH_TRACKS) {
      setLimitError(true);
      setOpen(true);
      return;
    }
    const core = getTauriCore();
    if (!core) return;
    if (!preservePostAnalysisResults) {
      setRetainedPostAnalysisTrackIds([]);
      setRetainedPostAnalysisSummary({ ...EMPTY_POST_ANALYSIS_SUMMARY });
    }
    setLimitError(false);
    setOpen(true);
    setReviewSelection({});
    setApplyResult(null);
    setCrateResult(null);
    const orchestrator = new MaestBatchOrchestrator({
      core,
      tracks: batchTracks,
      getTrackLink: (id) => getTrackLinkRef.current(id),
      includeAnalyzed,
      locale,
      onState: setState,
      onPreparationSettlingChange: (settling) => {
        if (mountedRef.current) setPreparationSettling(settling);
      },
    });
    orchestratorRef.current = orchestrator;
    void orchestrator.run();
  }

  async function cancelBatch() {
    await orchestratorRef.current?.cancel();
  }

  function closeResults() {
    orchestratorRef.current?.dispose();
    orchestratorRef.current = null;
    setState(null);
    setReviewSelection({});
    setApplyResult(null);
    setCrateResult(null);
    setRetainedPostAnalysisTrackIds([]);
    setRetainedPostAnalysisSummary({ ...EMPTY_POST_ANALYSIS_SUMMARY });
    setOpen(false);
  }

  function retryFailed() {
    if (!state) return;
    setRetainedPostAnalysisTrackIds(postAnalysisTrackIds);
    const retainedFromCurrentRun = summarizePostAnalysis(
      state.items.filter((item) => item.status !== "failed"),
      state.phase,
    );
    setRetainedPostAnalysisSummary((current) =>
      mergePostAnalysisSummaries(current, retainedFromCurrentRun),
    );
    startBatch(
      state.items
        .filter((item) => item.status === "failed")
        .map(({ trackId, title, artist, evidence }) => ({
          trackId,
          title,
          artist,
          evidence,
        })),
      true,
    );
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

  const counts = state?.items.reduce(
    (result, item) => {
      if (item.status === "completed") result.completed += 1;
      else if (item.status === "failed") result.failed += 1;
      else if (["skipped", "already_analyzed"].includes(item.status))
        result.skipped += 1;
      else if (["pending", "preparing", "analyzing"].includes(item.status))
        result.pending += 1;
      return result;
    },
    { completed: 0, skipped: 0, failed: 0, pending: 0 },
  );

  const applyRequestItems =
    state?.items.flatMap((item) => {
      if (item.status !== "completed" || !item.result) return [];
      const proposal = maestFormProposal(item.result);
      if (!proposal) return [];
      const selection = reviewSelection[item.trackId];
      const genre =
        selection?.genre && proposal.genre
          ? { expectedValue: item.evidence.genre.value, evidence: proposal.genre }
          : undefined;
      const subgenre =
        selection?.subgenre && proposal.subgenre
          ? {
              expectedValue: item.evidence.subgenre.value,
              evidence: proposal.subgenre,
            }
          : undefined;
      return genre || subgenre
        ? [
            {
              trackId: item.trackId,
              ...(genre ? { genre } : {}),
              ...(subgenre ? { subgenre } : {}),
            },
          ]
        : [];
    }) ?? [];
  const selectedFieldCount = applyRequestItems.reduce(
    (total, item) => total + (item.genre ? 1 : 0) + (item.subgenre ? 1 : 0),
    0,
  );
  const applyByTrack = new Map(
    applyResult?.items.map((item) => [item.trackId, item]) ?? [],
  );
  const currentPostAnalysisTrackIds =
    state?.items.flatMap((item) =>
      item.status === "completed" || item.status === "already_analyzed"
        ? [item.trackId]
        : [],
    ) ?? [];
  const postAnalysisTrackIds = [
    ...new Set([
      ...retainedPostAnalysisTrackIds,
      ...currentPostAnalysisTrackIds,
    ]),
  ];
  const terminal = Boolean(
    state && ["completed", "cancelled", "blocked"].includes(state.phase),
  );
  const postAnalysisSummary = mergePostAnalysisSummaries(
    retainedPostAnalysisSummary,
    summarizePostAnalysis(state?.items ?? [], state?.phase),
  );
  const reviewNeeded = postAnalysisSummary.ambiguous;

  async function applySelected() {
    if (!applyRequestItems.length || applying || busy) return;
    const confirmed = window.confirm(
      locale === "en"
        ? `Apply ${selectedFieldCount} selected MAEST proposal${selectedFieldCount === 1 ? "" : "s"} across ${applyRequestItems.length} track${applyRequestItems.length === 1 ? "" : "s"}?`
        : `¿Aplicar ${selectedFieldCount} propuesta${selectedFieldCount === 1 ? "" : "s"} MAEST seleccionada${selectedFieldCount === 1 ? "" : "s"} en ${applyRequestItems.length} pista${applyRequestItems.length === 1 ? "" : "s"}?`,
    );
    if (!confirmed) return;
    setApplying(true);
    try {
      const result = await applyMaestBatchProposalsAction({
        items: applyRequestItems,
      });
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

  async function createCrateFromResults() {
    if (
      !postAnalysisTrackIds.length ||
      creatingCrate ||
      applying ||
      busy ||
      !crateName.trim()
    )
      return;
    setCreatingCrate(true);
    setCrateResult(null);
    try {
      const result = await createPostAnalysisCrateAction({
        name: crateName,
        trackIds: postAnalysisTrackIds,
      });
      if (!mountedRef.current) return;
      setCrateResult(result);
      if (result.status === "created") router.refresh();
    } finally {
      if (mountedRef.current) setCreatingCrate(false);
    }
  }

  function continueWithDesktopTools() {
    if (!postAnalysisTrackIds.length) return;
    window.sessionStorage.setItem(
      DESKTOP_EXPORT_REQUEST_KEY,
      JSON.stringify({
        crateName: locale === "en" ? "Analyzed selection" : "Selección analizada",
        trackIds: postAnalysisTrackIds,
      }),
    );
    router.push("/import");
  }

  return (
    <div className="maest-batch">
      <button
        className="button button--secondary button--small"
        disabled={
          maestBatchActionDisabled(
            tracks.length,
            Boolean(busy),
            preparationSettling,
          ) || applying
        }
        onClick={() => startBatch()}
        type="button"
      >
        {locale === "en"
          ? "Analyze genre and subgenre"
          : "Analizar género y subgénero"}
      </button>
      {open ? (
        <section
          aria-label={
            locale === "en"
              ? "Batch genre and subgenre analysis"
              : "Análisis de género y subgénero por lote"
          }
          className="maest-batch__panel"
        >
          <label className="maest-batch__option">
            <input
              checked={includeAnalyzed}
              disabled={busy || applying}
              onChange={(event) => setIncludeAnalyzed(event.target.checked)}
              type="checkbox"
            />
            {locale === "en"
              ? "Re-analyze already classified tracks"
              : "Volver a analizar las ya clasificadas"}
          </label>
          {limitError ? (
            <p className="form-message form-message--error" role="alert">
              {locale === "en"
                ? "Select no more than 25 tracks."
                : "Selecciona como máximo 25 pistas."}
            </p>
          ) : null}
          {applyResult?.status === "invalid" ? (
            <p className="form-message form-message--error" role="alert">
              {locale === "en"
                ? "The selected proposals were rejected as invalid."
                : "Las propuestas seleccionadas se rechazaron por no ser válidas."}
            </p>
          ) : null}
          {state ? (
            <>
              <div aria-live="polite">
                {state.phase === "preparing-model" ? (
                  <p>
                    {locale === "en"
                      ? "Preparing analyzer…"
                      : "Preparando analizador…"}
                  </p>
                ) : null}
                {state.phase === "running" &&
                state.currentEligibleOrdinal !== null ? (
                  <p>
                    {locale === "en"
                      ? `Analyzing track ${state.currentEligibleOrdinal} of ${state.eligibleTotal}`
                      : `Analizando ${state.currentEligibleOrdinal} de ${state.eligibleTotal} pistas`}
                  </p>
                ) : null}
                {state.progress ? (
                  <p>{maestProgressText(state.progress, locale)}</p>
                ) : null}
                {counts ? (
                  <p>
                    {locale === "en"
                      ? `Completed: ${counts.completed} · Skipped: ${counts.skipped} · Failed: ${counts.failed} · Pending: ${counts.pending}`
                      : `Completadas: ${counts.completed} · Omitidas: ${counts.skipped} · Fallidas: ${counts.failed} · Pendientes: ${counts.pending}`}
                  </p>
                ) : null}
              </div>
              {state.error ? (
                <p className="form-message form-message--error" role="alert">
                  {state.error}
                </p>
              ) : null}
              <ul className="maest-batch__results">
                {state.items.map((item) => {
                  const proposal = item.result
                    ? maestFormProposal(item.result)
                    : null;
                  const applied = applyByTrack.get(item.trackId);
                  return (
                    <li key={item.trackId}>
                      <strong>{item.title}</strong>
                      <span>
                        {item.artist ??
                          (locale === "en"
                            ? "Unknown artist"
                            : "Artista desconocido")}
                      </span>
                      <span>{batchStatus(item.status, locale)}</span>
                      {proposal?.genre ? (
                        <label className="maest-batch__option">
                          <input
                            checked={
                              reviewSelection[item.trackId]?.genre ?? false
                            }
                            disabled={Boolean(busy) || applying}
                            onChange={() => toggleReview(item.trackId, "genre")}
                            type="checkbox"
                          />
                          {locale === "en" ? "Apply genre" : "Aplicar género"}: {item.evidence.genre.value ?? "—"} → {proposal.genre.value}
                        </label>
                      ) : null}
                      {proposal?.subgenre ? (
                        <label className="maest-batch__option">
                          <input
                            checked={
                              reviewSelection[item.trackId]?.subgenre ?? false
                            }
                            disabled={Boolean(busy) || applying}
                            onChange={() =>
                              toggleReview(item.trackId, "subgenre")
                            }
                            type="checkbox"
                          />
                          {locale === "en"
                            ? "Apply subgenre"
                            : "Aplicar subgénero"}: {item.evidence.subgenre.value ?? "—"} → {proposal.subgenre.value}
                        </label>
                      ) : null}
                      {applied ? (
                        <span role="status">
                          {locale === "en"
                            ? `Apply result: ${applyStatus(applied.status, locale)} · Genre: ${applyStatus(applied.genre, locale)} · Subgenre: ${applyStatus(applied.subgenre, locale)}`
                            : `Resultado: ${applyStatus(applied.status, locale)} · Género: ${applyStatus(applied.genre, locale)} · Subgénero: ${applyStatus(applied.subgenre, locale)}`}
                        </span>
                      ) : null}
                      {item.error ? (
                        <span className="form-message--error">{item.error}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {terminal ? (
                <section
                  aria-label={
                    locale === "en"
                      ? "Actions after analysis"
                      : "Acciones después del análisis"
                  }
                >
                  <h3>
                    {locale === "en"
                      ? "What do you want to do next?"
                      : "¿Qué quieres hacer ahora?"}
                  </h3>
                  <p role="status">
                    {locale === "en"
                      ? `Ready without issues: ${postAnalysisSummary.ready} · Need review: ${postAnalysisSummary.ambiguous} · Duplicates: ${postAnalysisSummary.duplicates} · Failed: ${postAnalysisSummary.failed}${postAnalysisSummary.omitted ? ` · Omitted: ${postAnalysisSummary.omitted}` : ""}`
                      : `Sin incidencias: ${postAnalysisSummary.ready} · Requieren revisión: ${postAnalysisSummary.ambiguous} · Duplicadas: ${postAnalysisSummary.duplicates} · Fallidas: ${postAnalysisSummary.failed}${postAnalysisSummary.omitted ? ` · Omitidas: ${postAnalysisSummary.omitted}` : ""}`}
                  </p>
                  <p>
                    {locale === "en"
                      ? "Ready means the analysis produced a structurally usable result; it does not mean the prediction has been musically confirmed. Duplicates are detected during Import before a saved library track reaches this batch."
                      : "Sin incidencias significa que el análisis produjo un resultado estructuralmente utilizable; no implica que la predicción se haya confirmado musicalmente. Los duplicados se detectan durante Importar antes de que una pista guardada llegue a este lote."}
                  </p>
                  <p>
                    {locale === "en"
                      ? `${postAnalysisTrackIds.length} tracks are ready for the next step${reviewNeeded ? `; ${reviewNeeded} need review` : ""}. Failed, cancelled or unlinked tracks are not included automatically.`
                      : `${postAnalysisTrackIds.length} pistas están listas para el siguiente paso${reviewNeeded ? `; ${reviewNeeded} requieren revisión` : ""}. Las pistas fallidas, canceladas o sin vínculo no se incluyen automáticamente.`}
                  </p>
                  <label className="field">
                    {locale === "en" ? "New crate name" : "Nombre del nuevo crate"}
                    <input
                      disabled={creatingCrate || applying}
                      maxLength={120}
                      onChange={(event) => {
                        setCrateName(event.target.value);
                        setCrateResult(null);
                      }}
                      value={crateName}
                    />
                  </label>
                  {crateResult?.status === "duplicate" ? (
                    <p
                      className="form-message form-message--error"
                      role="alert"
                    >
                      {locale === "en"
                        ? "A crate with that name already exists."
                        : "Ya existe un crate con ese nombre."}
                    </p>
                  ) : null}
                  {crateResult?.status === "invalid" ? (
                    <p
                      className="form-message form-message--error"
                      role="alert"
                    >
                      {locale === "en"
                        ? "The crate could not be created from this selection."
                        : "No se pudo crear el crate con esta selección."}
                    </p>
                  ) : null}
                  {crateResult?.status === "failed" ? (
                    <p
                      className="form-message form-message--error"
                      role="alert"
                    >
                      {locale === "en"
                        ? "The crate could not be saved. Try again."
                        : "No se pudo guardar el crate. Inténtalo de nuevo."}
                    </p>
                  ) : null}
                  {crateResult?.status === "created" ? (
                    <p className="form-message" role="status">
                      {locale === "en" ? "Crate created. " : "Crate creado. "}
                      <Link href={`/crates/${crateResult.crateId}`}>
                        {locale === "en" ? "Open crate" : "Abrir crate"}
                      </Link>
                    </p>
                  ) : null}
                  <div className="form-actions">
                    <button
                      className="button button--primary button--small"
                      disabled={
                        !postAnalysisTrackIds.length ||
                        !crateName.trim() ||
                        creatingCrate ||
                        applying
                      }
                      onClick={createCrateFromResults}
                      type="button"
                    >
                      {creatingCrate
                        ? locale === "en"
                          ? "Creating crate…"
                          : "Creando crate…"
                        : locale === "en"
                          ? "Create crate"
                          : "Crear crate"}
                    </button>
                    <button
                      className="button button--secondary button--small"
                      disabled={!postAnalysisTrackIds.length || applying}
                      onClick={continueWithDesktopTools}
                      type="button"
                    >
                      {locale === "en"
                        ? "Organize, write metadata or export"
                        : "Organizar, escribir metadatos o exportar"}
                    </button>
                    <button
                      className="button button--secondary button--small"
                      disabled={applying || creatingCrate}
                      onClick={closeResults}
                      type="button"
                    >
                      {locale === "en" ? "Finish" : "Terminar"}
                    </button>
                  </div>
                  <p>
                    {locale === "en"
                      ? "File actions continue in the desktop tools with this selection prepared. Moving files and writing tags still require their existing preview and confirmation steps."
                      : "Las acciones sobre archivos continúan en las herramientas de escritorio con esta selección preparada. Mover archivos y escribir etiquetas siguen exigiendo su previsualización y confirmación actuales."}
                  </p>
                </section>
              ) : null}
            </>
          ) : null}
          <div className="form-actions">
            {busy ? (
              <button
                className="button button--secondary button--small"
                onClick={cancelBatch}
                type="button"
              >
                {locale === "en" ? "Cancel batch" : "Cancelar lote"}
              </button>
            ) : null}
            {!busy && applyRequestItems.length ? (
              <button
                className="button button--primary button--small"
                disabled={applying}
                onClick={applySelected}
                type="button"
              >
                {applying
                  ? locale === "en"
                    ? "Applying proposals…"
                    : "Aplicando propuestas…"
                  : locale === "en"
                    ? "Apply selected proposals"
                    : "Aplicar propuestas seleccionadas"}
              </button>
            ) : null}
            {state?.items.some((item) => item.status === "failed") && !busy ? (
              <button
                className="button button--secondary button--small"
                disabled={applying || creatingCrate}
                onClick={retryFailed}
                type="button"
              >
                {locale === "en" ? "Retry failed" : "Reintentar fallidas"}
              </button>
            ) : null}
            {!busy && !terminal ? (
              <button
                className="button button--secondary button--small"
                disabled={applying || creatingCrate}
                onClick={closeResults}
                type="button"
              >
                {locale === "en" ? "Close results" : "Cerrar resultados"}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function batchStatus(
  status: MaestBatchState["items"][number]["status"],
  locale: "es" | "en",
) {
  const labels =
    locale === "en"
      ? {
          pending: "Pending",
          preparing: "Preparing",
          analyzing: "Analyzing",
          completed: "Completed",
          failed: "Failed",
          cancelled: "Cancelled",
          skipped: "Skipped",
          already_analyzed: "Already analyzed",
        }
      : {
          pending: "Pendiente",
          preparing: "Preparando",
          analyzing: "Analizando",
          completed: "Completada",
          failed: "Fallida",
          cancelled: "Cancelada",
          skipped: "Omitida",
          already_analyzed: "Ya analizada",
        };
  return labels[status];
}

function applyStatus(
  status: "applied" | "omitted" | "conflict" | "failed",
  locale: "es" | "en",
) {
  const labels =
    locale === "en"
      ? {
          applied: "Applied",
          omitted: "Omitted",
          conflict: "Conflict",
          failed: "Failed",
        }
      : {
          applied: "Aplicado",
          omitted: "Omitido",
          conflict: "Conflicto",
          failed: "Fallido",
        };
  return labels[status];
}
