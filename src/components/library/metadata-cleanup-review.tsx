"use client";

import { useMemo, useState } from "react";
import { applyMetadataCleanupAction } from "@/app/library/health/cleanup/actions";
import type {
  MetadataCleanupField,
  MetadataCleanupProposal,
  MetadataCleanupReason,
} from "@/lib/library/metadata-cleanup";
import type { Locale } from "@/lib/i18n/i18n";
import styles from "@/app/library/health/cleanup/metadata-cleanup.module.css";

function proposalKey(proposal: MetadataCleanupProposal) {
  return `${proposal.trackId}:${proposal.field}`;
}

function fieldLabel(locale: Locale, field: MetadataCleanupField) {
  const en = locale === "en";
  return {
    album: en ? "Album" : "Álbum",
    artist: en ? "Artist" : "Artista",
    genre: en ? "Genre" : "Género",
    subgenre: en ? "Subgenre" : "Subgénero",
    title: en ? "Title" : "Título",
  }[field];
}

function reasonLabel(locale: Locale, reason: MetadataCleanupReason) {
  const en = locale === "en";
  return {
    case: en ? "Capitalization" : "Mayúsculas/minúsculas",
    "genre-alias": en ? "Genre name" : "Nombre de género",
    "separator-spacing": en ? "Separators" : "Separadores",
    "track-number": en ? "Track prefix" : "Prefijo numérico",
    url: en ? "Residual URL" : "URL residual",
    whitespace: en ? "Whitespace" : "Espacios",
  }[reason];
}

export function MetadataCleanupReview({
  locale,
  page,
  proposals,
}: {
  locale: Locale;
  page: number;
  proposals: MetadataCleanupProposal[];
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const en = locale === "en";
  const selectedProposals = useMemo(
    () => proposals.filter((proposal) => selected.has(proposalKey(proposal))),
    [proposals, selected],
  );

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <form action={applyMetadataCleanupAction} className={styles.review}>
      <input name="page" type="hidden" value={page} />
      <div className={styles.reviewToolbar}>
        <div>
          <strong>
            {selected.size.toLocaleString(locale)} / {proposals.length.toLocaleString(locale)}
          </strong>{" "}
          {en ? "changes selected" : "cambios seleccionados"}
        </div>
        <div className={styles.actions}>
          <button
            className="button button--secondary button--small"
            onClick={() =>
              setSelected(new Set(proposals.map((proposal) => proposalKey(proposal))))
            }
            type="button"
          >
            {en ? "Select all" : "Seleccionar todos"}
          </button>
          <button
            className="button button--secondary button--small"
            disabled={!selected.size}
            onClick={() => setSelected(new Set())}
            type="button"
          >
            {en ? "Clear" : "Quitar selección"}
          </button>
        </div>
      </div>

      <ul className={styles.proposalList}>
        {proposals.map((proposal) => {
          const key = proposalKey(proposal);
          const checked = selected.has(key);
          return (
            <li className={styles.proposal} key={key}>
              <label className={styles.proposalSelect}>
                <input
                  checked={checked}
                  onChange={() => toggle(key)}
                  type="checkbox"
                />
                <span>
                  <strong>{proposal.trackTitle}</strong>
                  <small>{fieldLabel(locale, proposal.field)}</small>
                </span>
              </label>
              <div className={styles.values}>
                <div>
                  <span>{en ? "Current" : "Actual"}</span>
                  <strong>{proposal.currentValue}</strong>
                </div>
                <span aria-hidden="true" className={styles.arrow}>→</span>
                <div>
                  <span>{en ? "Proposed" : "Propuesto"}</span>
                  <strong>{proposal.proposedValue}</strong>
                </div>
              </div>
              <div className={styles.reasons}>
                {proposal.reasons.map((reason) => (
                  <span className={styles.reason} key={reason}>
                    {reasonLabel(locale, reason)}
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {selectedProposals.map((proposal) => (
        <input
          key={proposalKey(proposal)}
          name="proposal"
          type="hidden"
          value={JSON.stringify({
            currentValue: proposal.currentValue,
            field: proposal.field,
            proposedValue: proposal.proposedValue,
            trackId: proposal.trackId,
          })}
        />
      ))}

      <div className={styles.applyBar}>
        <p>
          {en
            ? "This updates DJOrganizer metadata only. Audio files are not written from this screen."
            : "Esto actualiza solo los metadatos de DJOrganizer. Desde esta pantalla no se escriben archivos de audio."}
        </p>
        <button
          className="button button--primary"
          disabled={!selected.size}
          type="submit"
        >
          {en
            ? `Apply ${selected.size.toLocaleString(locale)} selected`
            : `Aplicar ${selected.size.toLocaleString(locale)} seleccionados`}
        </button>
      </div>
    </form>
  );
}
