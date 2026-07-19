"use client";

import { useRef, useState } from "react";
import {
  createBackupAction,
  restoreBackupAction,
} from "@/app/settings/actions";

export function BackupManager() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function downloadBackup() {
    setBusy(true);
    setMessage(null);
    try {
      const contents = await createBackupAction();
      const url = URL.createObjectURL(
        new Blob([contents], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `djorganizer-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Copia de seguridad descargada.");
    } catch {
      setMessage("No se pudo crear la copia de seguridad.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    if (
      !window.confirm(
        "La restauración combinará la copia con tu biblioteca actual. ¿Continuar?",
      )
    ) {
      if (input.current) input.current.value = "";
      return;
    }
    setBusy(true);
    try {
      const result = await restoreBackupAction(await file.text(), true);
      setMessage(result.message);
    } catch {
      setMessage("No se pudo restaurar la copia de seguridad.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="backup-manager">
      <button
        className="button button--secondary"
        disabled={busy}
        onClick={() => void downloadBackup()}
        type="button"
      >
        Descargar copia completa
      </button>
      <input
        ref={input}
        accept="application/json,.json"
        className="visually-hidden"
        id="restore-backup"
        onChange={(event) => void restore(event.target.files?.[0])}
        type="file"
      />
      <label className="button button--secondary" htmlFor="restore-backup">
        Restaurar copia
      </label>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
