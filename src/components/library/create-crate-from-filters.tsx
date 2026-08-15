"use client";

import Link from "next/link";
import { useState } from "react";
import {
  createCrateFromFiltersAction,
  type CreateCrateFromTrackIdsResult,
} from "@/app/library/post-analysis-actions";
import { useTranslator } from "@/components/i18n/locale-provider";

export function CreateCrateFromFilters({
  filteredCount,
  searchParams,
}: {
  filteredCount: number;
  searchParams: string;
}) {
  const { locale } = useTranslator();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [result, setResult] = useState<CreateCrateFromTrackIdsResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function createCrate() {
    if (!name.trim() || filteredCount < 1 || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      setResult(
        await createCrateFromFiltersAction({
          name,
          searchParams,
        }),
      );
    } catch {
      setResult({ status: "failed" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <button
        className="button button--secondary button--small"
        disabled={filteredCount < 1}
        onClick={() => {
          setOpen((current) => !current);
          setResult(null);
        }}
        type="button"
      >
        {locale === "en" ? "Create crate from filters" : "Crear crate con filtros"}
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
            disabled={!name.trim() || submitting || filteredCount < 1}
            onClick={createCrate}
            type="button"
          >
            {submitting
              ? locale === "en"
                ? "Creating…"
                : "Creando…"
              : locale === "en"
                ? `Create with ${filteredCount} filtered result${filteredCount === 1 ? "" : "s"}`
                : `Crear con ${filteredCount} resultado${filteredCount === 1 ? "" : "s"} filtrado${filteredCount === 1 ? "" : "s"}`}
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
                ? "These filters no longer return tracks. Refresh the library and try again."
                : "Estos filtros ya no devuelven pistas. Actualiza la biblioteca e inténtalo de nuevo."}
            </span>
          ) : null}
          {result?.status === "failed" ? (
            <span className="form-message form-message--error" role="alert">
              {locale === "en"
                ? "The crate could not be created. Check the connection and try again."
                : "No se pudo crear el crate. Comprueba la conexión e inténtalo de nuevo."}
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
