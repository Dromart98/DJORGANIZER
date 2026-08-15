"use client";

import Link from "next/link";
import { useTranslator } from "@/components/i18n/locale-provider";
import type { TrackQuery } from "@/lib/library/track-query";

export function TrackFilters({ query }: { query: TrackQuery }) {
  const { locale, t } = useTranslator();
  return (
    <form className="library-filters card" method="get">
      <div className="filter-primary">
        <label className="field">
          <span>{t("Buscar")}</span>
          <input
            defaultValue={query.q}
            maxLength={120}
            name="q"
            placeholder={t("Buscar en biblioteca…")}
            type="search"
          />
        </label>
        <label className="field">
          <span>{t("Género")}</span>
          <input defaultValue={query.genre} maxLength={120} name="genre" />
        </label>
        <label className="field">
          <span>{t("Subgénero")}</span>
          <input defaultValue={query.subgenre} maxLength={120} name="subgenre" />
        </label>
        <label className="field">
          <span>{t("Tonalidad")}</span>
          <input defaultValue={query.key} maxLength={16} name="key" />
        </label>
        <label className="field">
          <span>Camelot</span>
          <input defaultValue={query.camelot} maxLength={3} name="camelot" />
        </label>
        <label className="field">
          <span>{locale === "en" ? "Status" : "Estado"}</span>
          <select defaultValue={query.status} name="status">
            <option value="active">
              {locale === "en" ? "Active" : "Activas"}
            </option>
            <option value="archived">
              {locale === "en" ? "Archived" : "Archivadas"}
            </option>
            <option value="all">{locale === "en" ? "All" : "Todas"}</option>
          </select>
        </label>
      </div>
      <details className="filter-advanced">
        <summary>{t("Más filtros")}</summary>
        <div className="filter-range-grid">
          <label className="field">
            <span>{t("BPM mínimo")}</span>
            <input
              defaultValue={query.bpmMin}
              max={300}
              min={20}
              name="bpmMin"
              type="number"
            />
          </label>
          <label className="field">
            <span>{t("BPM máximo")}</span>
            <input
              defaultValue={query.bpmMax}
              max={300}
              min={20}
              name="bpmMax"
              type="number"
            />
          </label>
          <label className="field">
            <span>{t("Energía mínima")}</span>
            <input
              defaultValue={query.energyMin}
              max={10}
              min={0}
              name="energyMin"
              type="number"
            />
          </label>
          <label className="field">
            <span>{t("Energía máxima")}</span>
            <input
              defaultValue={query.energyMax}
              max={10}
              min={0}
              name="energyMax"
              type="number"
            />
          </label>
          <label className="field">
            <span>{t("Valoración mínima")}</span>
            <select defaultValue={query.rating ?? ""} name="rating">
              <option value="">{t("Cualquiera")}</option>
              {[0, 1, 2, 3, 4, 5].map((rating) => (
                <option key={rating} value={rating}>
                  {rating}+
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
      <input name="sort" type="hidden" value={query.sort} />
      <input name="direction" type="hidden" value={query.direction} />
      <div className="filter-actions">
        <Link className="button button--secondary" href="/library">
          {t("Limpiar")}
        </Link>
        <button className="button button--primary" type="submit">
          {t("Aplicar")}
        </button>
      </div>
    </form>
  );
}
