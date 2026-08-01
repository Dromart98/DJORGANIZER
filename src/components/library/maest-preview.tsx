"use client";

import { useEffect, useRef, useState } from "react";
import { useDesktopScanSession } from "@/components/desktop/scan-session-provider";
import { useTranslator } from "@/components/i18n/locale-provider";
import {
  createMaestPreviewState,
  invokeMaestPreview,
  maestFormProposal,
  maestSurfaceVisibility,
  maestErrorMessage,
  reduceMaestPreviewState,
  sameMaestLink,
  type MaestLinkIdentity,
  type MaestPreviewAction,
  type MaestFormProposal,
} from "@/lib/desktop/maest-preview";
import { getTauriCore } from "@/lib/desktop/tauri";

export function MaestPreview({
  onApply,
  trackId,
}: {
  onApply: (proposal: MaestFormProposal) => void;
  trackId: string;
}) {
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
  const stateRef = useRef(state);
  stateRef.current = state;
  const requestCounter = useRef(0);
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;

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
    transition({ type: "linkChanged", identity });
    setApplied(false);
    // `identity` is deliberately represented by its opaque primitive parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, sessionId, trackId]);

  async function analyze() {
    if (!sessionId || !scanId) return;
    setApplied(false);
    const requestId = ++requestCounter.current;
    const started = transition({ type: "start", requestId });
    const request = started.activeRequest;
    if (!request || request.requestId !== requestId || started.phase !== "preparing") return;
    const core = getTauriCore();
    if (!core) {
      transition({
        type: "failed",
        request,
        error: locale === "en" ? "Local analysis is available in the desktop app." : "El análisis local está disponible en la aplicación de escritorio.",
      });
      return;
    }

    try {
      const result = await invokeMaestPreview(core, sessionId, scanId, () => {
        transition({ type: "prepared", request });
      });
      transition({ type: "succeeded", request, result });
    } catch (caught) {
      transition({
        type: "failed",
        request,
        error: maestErrorMessage(caught, locale),
      });
    }
  }

  const visibleState = sameMaestLink(state.identity, identity)
    ? state
    : createMaestPreviewState(identity);
  const { error, phase, proposal } = visibleState;
  const surface = maestSurfaceVisibility(desktopAvailable, identity);
  if (surface === "hidden") return null;
  const isBusy = phase !== "idle";
  const genre = proposal?.analysis.genre;
  const subgenre = proposal?.analysis.subgenre;
  const formProposal = maestFormProposal(proposal);

  function applyToForm() {
    if (!formProposal) return;
    onApply(formProposal);
    setApplied(true);
  }

  return (
    <section aria-labelledby="maest-preview-title" className="maest-preview">
      <div className="maest-preview__heading">
        <div>
          <p className="eyebrow">{locale === "en" ? "Read-only proposal" : "Propuesta sin aplicar"}</p>
          <h2 id="maest-preview-title">{locale === "en" ? "Genre and subgenre analysis" : "Análisis de género y subgénero"}</h2>
        </div>
        {surface === "linked" ? (
          <button className="button button--secondary" disabled={isBusy} onClick={analyze} type="button">
            {phase === "preparing"
              ? locale === "en" ? "Preparing analyzer…" : "Preparando analizador…"
              : phase === "analyzing"
                ? locale === "en" ? "Analyzing track…" : "Analizando pista…"
                : proposal
                  ? locale === "en" ? "Analyze again" : "Volver a analizar"
                  : locale === "en" ? "Analyze locally" : "Analizar localmente"}
          </button>
        ) : null}
      </div>
      {surface === "unlinked" ? (
        <p className="organization-muted" role="status">
          {locale === "en" ? "Link this track to the active local scan before analyzing it." : "Vincula primero esta pista con el escaneo local activo para analizarla."}
        </p>
      ) : null}
      {isBusy ? (
        <p aria-live="polite" className="organization-muted">
          {phase === "preparing"
            ? locale === "en" ? "Preparing the local analyzer. The first preparation may download about 348 MB." : "Preparando el analizador local. La primera preparación puede descargar unos 348 MB."
            : locale === "en" ? "Analyzing the linked track on this device…" : "Analizando la pista vinculada en este dispositivo…"}
        </p>
      ) : null}
      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
      {proposal ? (
        <div className="maest-proposal" aria-live="polite">
          <dl>
            <div><dt>{locale === "en" ? "Proposed genre" : "Género propuesto"}</dt><dd>{genre?.proposedValue ?? "—"}</dd></div>
            <div><dt>{locale === "en" ? "Proposed subgenre" : "Subgénero propuesto"}</dt><dd>{subgenre?.proposedValue ?? "—"}</dd></div>
          </dl>
          <div className="form-actions">
            {formProposal ? (
              <button className="button button--primary button--small" onClick={applyToForm} type="button">
                {locale === "en" ? "Apply to form" : "Aplicar al formulario"}
              </button>
            ) : null}
            <button className="button button--secondary button--small" onClick={() => transition({ type: "discard" })} type="button">
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
    </section>
  );
}
