"use client";

import { useEffect } from "react";
import { useTranslator } from "@/components/i18n/locale-provider";
import {
  clearDiagnosticEvents,
  createDiagnosticReport,
  recordDiagnosticEvent,
} from "@/lib/diagnostics/local-diagnostics";

export function DiagnosticsCapture() {
  const { t } = useTranslator();
  useEffect(() => {
    const runtimeError = (event: ErrorEvent) => {
      recordDiagnosticEvent(window.localStorage, {
        category: "runtime",
        createdAt: new Date().toISOString(),
        message: event.message || t("Error de ejecución sin detalle."),
      });
    };
    const rejection = (event: PromiseRejectionEvent) => {
      recordDiagnosticEvent(window.localStorage, {
        category: "runtime",
        createdAt: new Date().toISOString(),
        message:
          event.reason instanceof Error
            ? event.reason.message
            : t("Promesa rechazada sin detalle."),
      });
    };
    const online = () =>
      recordDiagnosticEvent(window.localStorage, {
        category: "connectivity",
        createdAt: new Date().toISOString(),
        message: t("Conexión recuperada."),
      });
    const offline = () =>
      recordDiagnosticEvent(window.localStorage, {
        category: "connectivity",
        createdAt: new Date().toISOString(),
        message: t("Conexión perdida."),
      });
    window.addEventListener("error", runtimeError);
    window.addEventListener("unhandledrejection", rejection);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("error", runtimeError);
      window.removeEventListener("unhandledrejection", rejection);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [t]);
  return null;
}

export function PrivacyDiagnostics() {
  const { t } = useTranslator();
  function download() {
    const report = createDiagnosticReport(window.localStorage, {
      language: navigator.language,
      online: navigator.onLine,
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.download = `djorganizer-diagnostico-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="settings-inline-actions">
      <button
        className="button button--secondary button--small"
        onClick={download}
        type="button"
      >
        {t("Exportar diagnóstico")}
      </button>
      <button
        className="button button--secondary button--small"
        onClick={() => clearDiagnosticEvents(window.localStorage)}
        type="button"
      >
        {t("Borrar diagnóstico")}
      </button>
    </div>
  );
}
