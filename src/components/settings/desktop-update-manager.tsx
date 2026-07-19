"use client";

import { useEffect, useState } from "react";

type DesktopUpdateStatus = {
  available: boolean;
  notes: string | null;
  version: string | null;
};

interface TauriCore {
  invoke<T>(command: string): Promise<T>;
}

function getTauriCore() {
  if (typeof window === "undefined") return undefined;
  return (
    window as Window & { __TAURI__?: { core?: TauriCore } }
  ).__TAURI__?.core;
}

export function DesktopUpdateManager() {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setAvailable(Boolean(getTauriCore()));
  }, []);
  if (!available) return null;

  async function check() {
    const core = getTauriCore();
    if (!core) return;
    setBusy(true);
    setMessage(null);
    try {
      const result =
        await core.invoke<DesktopUpdateStatus>("check_for_updates");
      setStatus(result);
      setMessage(
        result.available
          ? `Versión ${result.version} disponible.`
          : "DJOrganizer está actualizado.",
      );
    } catch (error) {
      setMessage(
        typeof error === "string"
          ? error
          : "No se pudo comprobar la actualización.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function install() {
    const core = getTauriCore();
    if (!core || !status?.available) return;
    if (
      !window.confirm(
        "La actualización está firmada y se instalará ahora. En Windows la aplicación puede cerrarse automáticamente. ¿Continuar?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage("Descargando y verificando la actualización…");
    try {
      await core.invoke<DesktopUpdateStatus>("install_available_update");
      setMessage(
        "Actualización instalada. Reinicia DJOrganizer para usar la nueva versión.",
      );
    } catch (error) {
      setMessage(
        typeof error === "string"
          ? error
          : "No se pudo instalar la actualización.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="desktop-update-manager">
      <div className="action-row">
        <button
          className="button button--secondary"
          disabled={busy}
          onClick={() => void check()}
          type="button"
        >
          {busy ? "Comprobando…" : "Buscar actualizaciones"}
        </button>
        {status?.available ? (
          <button
            className="button button--primary"
            disabled={busy}
            onClick={() => void install()}
            type="button"
          >
            Instalar {status.version}
          </button>
        ) : null}
      </div>
      {status?.notes ? <p>{status.notes}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
