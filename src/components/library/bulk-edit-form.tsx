"use client";

import { useState } from "react";
import { bulkUpdateTracksAction } from "@/app/library/actions";
import { useTranslator } from "@/components/i18n/locale-provider";
import { formatBulkEditConfirmation } from "@/lib/i18n/functional";

const fields = [
  { label: "Álbum", name: "album", placeholder: "Nombre del álbum", type: "text" },
  { label: "Género", name: "genre", placeholder: "House, Techno…", type: "text" },
  { label: "Subgénero", name: "subgenre", placeholder: "Deep House…", type: "text" },
  { label: "BPM", max: 300, min: 20, name: "bpm", placeholder: "20–300", type: "number" },
  { label: "Tonalidad", name: "musical_key", placeholder: "Am, F# major o 8A", type: "text" },
  { label: "Energía", max: 10, min: 0, name: "energy", placeholder: "0–10", type: "number" },
  { label: "Valoración", max: 5, min: 0, name: "rating", placeholder: "0–5", type: "number" },
  { label: "Año", max: 2100, min: 1000, name: "release_year", placeholder: "AAAA", type: "number" },
  { label: "Comentarios", name: "comments", placeholder: "Comentario común", type: "text" },
] as const;

type BulkField = (typeof fields)[number]["name"];

export function BulkEditForm({
  returnTo,
  selectedIds,
}: {
  returnTo: string;
  selectedIds: string[];
}) {
  const [field, setField] = useState<BulkField>("genre");
  const { locale, t } = useTranslator();
  const config = fields.find((item) => item.name === field) ?? fields[0];
  const disabled = selectedIds.length === 0;

  return (
    <form
      action={bulkUpdateTracksAction}
      className="bulk-edit-form"
      data-offline-action="track-bulk-update"
      data-offline-confirm={formatBulkEditConfirmation(
        locale,
        selectedIds.length,
      )}
      onSubmit={(event) => {
        if (
          !window.confirm(
            formatBulkEditConfirmation(locale, selectedIds.length),
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      {selectedIds.map((id) => (
        <input key={id} name="trackId" type="hidden" value={id} />
      ))}
      <input name="returnTo" type="hidden" value={returnTo} />
      <label className="visually-hidden" htmlFor="bulk-field">
        {t("Campo que se editará")}
      </label>
      <select
        disabled={disabled}
        id="bulk-field"
        name="field"
        onChange={(event) => setField(event.target.value as BulkField)}
        value={field}
      >
        {fields.map((item) => (
          <option key={item.name} value={item.name}>
            {t(item.label as Parameters<typeof t>[0])}
          </option>
        ))}
      </select>
      <label className="visually-hidden" htmlFor="bulk-value">
        {t("Nuevo valor")}
      </label>
      <input
        disabled={disabled}
        id="bulk-value"
        key={field}
        max={"max" in config ? config.max : undefined}
        min={"min" in config ? config.min : undefined}
        name="value"
        placeholder={t(config.placeholder as Parameters<typeof t>[0])}
        step={field === "bpm" ? "0.1" : "1"}
        type={config.type}
      />
      <button
        className="button button--secondary button--small"
        disabled={disabled}
        type="submit"
      >
        {t("Aplicar edición")}
      </button>
      <small>{t("Valor vacío = borrar campo")}</small>
    </form>
  );
}
