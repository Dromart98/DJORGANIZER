"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { prepareSmartCrateExportAction } from "@/app/crates/smart-export-actions";
import {
  DESKTOP_EXPORT_REQUEST_KEY,
  type DesktopExportRequest,
} from "@/lib/desktop/export-request";
import type { Locale } from "@/lib/i18n/i18n";

function hasDesktopExport() {
  return Boolean(
    (window as Window & { __TAURI__?: { core?: { invoke?: unknown } } })
      .__TAURI__?.core?.invoke,
  );
}

export function SmartCrateExportLink({
  crateId,
  crateName,
  locale,
}: {
  crateId: string;
  crateName: string;
  locale: Locale;
}) {
  const router = useRouter();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setAvailable(hasDesktopExport()), []);

  if (!available) {
    return (
      <p className="organization-muted" role="status">
        {locale === "en"
          ? "Export is available when this library is opened in the desktop app."
          : "La exportación está disponible al abrir esta biblioteca en la aplicación de escritorio."}
      </p>
    );
  }

  async function prepareExport() {
    setBusy(true);
    setMessage(null);
    const result = await prepareSmartCrateExportAction(crateId);
    if (!result.ok) {
      setMessage(result.message);
      setBusy(false);
      return;
    }
    const request: DesktopExportRequest = {
      crateId,
      crateName,
      trackIds: result.trackIds,
    };
    sessionStorage.setItem(
      DESKTOP_EXPORT_REQUEST_KEY,
      JSON.stringify(request),
    );
    router.push("/import");
  }

  return (
    <div>
      <button
        className="button button--secondary button--small"
        disabled={busy}
        onClick={prepareExport}
        type="button"
      >
        {busy
          ? locale === "en"
            ? "Preparing…"
            : "Preparando…"
          : locale === "en"
            ? "Export"
            : "Exportar"}
      </button>
      {message ? (
        <p className="organization-error" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
