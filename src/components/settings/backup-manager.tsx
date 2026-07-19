"use client";

import { useRef, useState } from "react";
import {
  createBackupAction,
  restoreBackupAction,
} from "@/app/settings/actions";
import { useTranslator } from "@/components/i18n/locale-provider";
import { translateKnown } from "@/lib/i18n/functional";

export function BackupManager() {
  const { locale, t } = useTranslator();
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
      setMessage(t("Copia de seguridad descargada."));
    } catch {
      setMessage(t("No se pudo crear la copia de seguridad."));
    } finally {
      setBusy(false);
    }
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    if (
      !window.confirm(
        t("La restauración combinará la copia con tu biblioteca actual. ¿Continuar?"),
      )
    ) {
      if (input.current) input.current.value = "";
      return;
    }
    setBusy(true);
    try {
      const result = await restoreBackupAction(await file.text(), true);
      setMessage(translateKnown(locale, result.message));
    } catch {
      setMessage(t("No se pudo restaurar la copia de seguridad."));
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
        {t("Descargar copia completa")}
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
        {t("Restaurar copia")}
      </label>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
