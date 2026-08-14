"use client";

import Link from "next/link";
import { useState } from "react";
import {
  createCrateFromTrackIdsAction,
  type CreateCrateFromTrackIdsResult,
} from "@/app/library/post-analysis-actions";
import { useTranslator } from "@/components/i18n/locale-provider";

export function CreateCrateFromSelection({
  trackIds,
}: {
  trackIds: string[];
}) {
  const { locale } = useTranslator();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [result, setResult] = useState<CreateCrateFromTrackIdsResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function createCrate() {
    if (!trackIds.length || !name.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      setResult(
        await createCrateFromTrackIdsAction({
          name,
          trackIds,
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        className="button button--secondary button--small"
        disabled={trackIds.length === 0}
        onClick={() => {
          setOpen((current) => !current);
          setResult(null);
        }}
        type="button"
      >
        {locale === "en" ? "Create crate" : "Crear crate"}
      </button>
      {open ? (
        <div className="form-actions">
          <label className="field">
            {locale === "en" ? "Crate name" : "Nombre del crate"}
            <input
              autoComplete="off"
              disabled={submitting}
              maxLength={120}
              onChange={(event) => {
                setName(event.target.value);
                setResult(null);
              }}
              value={name}
            />
          </label>
          <button
            className="button button--primary button--small"
            disabled={!name.trim() || submitting || trackIds.length === 0}
            onClick={createCrate}
            type="button"
          >
            {submitting
              ? locale === "en"
                ? "Creating…"
                : "Creando…"
              : locale === "en"
                ? `Create with ${trackIds.length} selected`
                : `Crear con ${trackIds.length} seleccionada${trackIds.length === 1 ? "" : "s"}`}
          </button>
          {result?.status === "duplicate" ? (
            <span className="form-message form-message--error" role="alert">
              {locale === "en"
                ? "A crate with that name already exists."
                : "Ya existe un crate con ese nombre."}
            </span>
          ) : null}
          {result?.status === "invalid" ? (
            <span className="form-message form-message--error" role="alert">
              {locale === "en"
                ? "The selection is no longer valid. Refresh the library and try again."
                : "La selección ya no es válida. Actualiza la biblioteca e inténtalo de nuevo."}
            </span>
          ) : null}
          {result?.status === "failed" ? (
            <span className="form-message form-message--error" role="alert">
              {locale === "en"
                ? "The crate could not be created. Try again."
                : "No se pudo crear el crate. Inténtalo de nuevo."}
            </span>
          ) : null}
          {result?.status === "created" ? (
            <span className="form-message form-message--success" role="status">
              {locale === "en" ? "Crate created. " : "Crate creado. "}
              <Link href={`/crates/${result.crateId}`}>
                {locale === "en" ? "Open crate" : "Abrir crate"}
              </Link>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
