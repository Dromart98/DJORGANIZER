"use client";

import { useEffect, useRef, useState } from "react";
import { useDesktopScanSession } from "@/components/desktop/scan-session-provider";
import { useTranslator } from "@/components/i18n/locale-provider";
import {
  invokeMaestPreview,
  isCurrentMaestRequest,
  maestErrorMessage,
  type MaestPublicResult,
  type MaestRequestIdentity,
} from "@/lib/desktop/maest-preview";
import { getTauriCore } from "@/lib/desktop/tauri";

type Phase = "idle" | "preparing" | "analyzing";

export function MaestPreview({ trackId }: { trackId: string }) {
  const { getTrackLink } = useDesktopScanSession();
  const { locale } = useTranslator();
  const link = getTrackLink(trackId);
  const sessionId = link?.sessionId ?? null;
  const scanId = link?.scanId ?? null;
  const [phase, setPhase] = useState<Phase>("idle");
  const [proposal, setProposal] = useState<MaestPublicResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestCounter = useRef(0);
  const activeRequest = useRef<MaestRequestIdentity | null>(null);
  const busy = useRef(false);
  const currentLink = useRef({ scanId, sessionId, trackId });
  currentLink.current = { scanId, sessionId, trackId };

  function requestStillMatches(request: MaestRequestIdentity) {
    const current = currentLink.current;
    return (
      current.trackId === request.trackId &&
      current.sessionId === request.sessionId &&
      current.scanId === request.scanId &&
      activeRequest.current !== null &&
      isCurrentMaestRequest(request, activeRequest.current)
    );
  }

  useEffect(() => {
    requestCounter.current += 1;
    activeRequest.current = null;
    busy.current = false;
    setPhase("idle");
    setProposal(null);
    setError(null);
  }, [scanId, sessionId, trackId]);

  async function analyze() {
    if (!sessionId || !scanId || busy.current) return;
    const core = getTauriCore();
    if (!core) {
      setError(locale === "en" ? "Local analysis is available in the desktop app." : "El análisis local está disponible en la aplicación de escritorio.");
      return;
    }

    busy.current = true;
    setError(null);
    setPhase("preparing");
    const request = {
      requestId: ++requestCounter.current,
      trackId,
      sessionId,
      scanId,
    };
    activeRequest.current = request;

    try {
      const result = await invokeMaestPreview(core, sessionId, scanId, () => {
        if (requestStillMatches(request)) {
          setPhase("analyzing");
        }
      });
      if (!requestStillMatches(request)) return;
      if (result.scanId !== scanId) return;
      setProposal(result);
    } catch (caught) {
      if (!requestStillMatches(request)) return;
      setProposal(null);
      setError(maestErrorMessage(caught, locale));
    } finally {
      if (requestStillMatches(request)) {
        busy.current = false;
        setPhase("idle");
      }
    }
  }

  const isBusy = phase !== "idle";
  const genre = proposal?.analysis.genre;
  const subgenre = proposal?.analysis.subgenre;
  const score = genre?.score ?? subgenre?.score;

  return (
    <section aria-labelledby="maest-preview-title" className="maest-preview">
      <div className="maest-preview__heading">
        <div>
          <p className="eyebrow">{locale === "en" ? "Read-only proposal" : "Propuesta sin aplicar"}</p>
          <h2 id="maest-preview-title">{locale === "en" ? "Genre and subgenre analysis" : "Análisis de género y subgénero"}</h2>
        </div>
        {link ? (
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
      {!link ? (
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
            <div><dt>Score</dt><dd>{score == null ? "—" : score.toString()}</dd></div>
          </dl>
          <button className="button button--secondary button--small" onClick={() => setProposal(null)} type="button">
            {locale === "en" ? "Discard proposal" : "Descartar propuesta"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
