import Link from "next/link";
import type { TrackQuery } from "@/lib/library/track-query";

export function TrackFilters({ query }: { query: TrackQuery }) {
  return (
    <form className="library-filters card" method="get">
      <div className="filter-primary">
        <label className="field">
          <span>Buscar</span>
          <input
            defaultValue={query.q}
            maxLength={120}
            name="q"
            placeholder="Título, artista o álbum"
            type="search"
          />
        </label>
        <label className="field">
          <span>Género</span>
          <input defaultValue={query.genre} maxLength={120} name="genre" />
        </label>
        <label className="field">
          <span>Tonalidad</span>
          <input defaultValue={query.key} maxLength={16} name="key" />
        </label>
        <label className="field">
          <span>Camelot</span>
          <input defaultValue={query.camelot} maxLength={3} name="camelot" />
        </label>
      </div>
      <details className="filter-advanced">
        <summary>Filtros avanzados</summary>
        <div className="filter-range-grid">
          <label className="field">
            <span>BPM mínimo</span>
            <input
              defaultValue={query.bpmMin}
              max={300}
              min={20}
              name="bpmMin"
              type="number"
            />
          </label>
          <label className="field">
            <span>BPM máximo</span>
            <input
              defaultValue={query.bpmMax}
              max={300}
              min={20}
              name="bpmMax"
              type="number"
            />
          </label>
          <label className="field">
            <span>Energía mínima</span>
            <input
              defaultValue={query.energyMin}
              max={100}
              min={0}
              name="energyMin"
              type="number"
            />
          </label>
          <label className="field">
            <span>Energía máxima</span>
            <input
              defaultValue={query.energyMax}
              max={100}
              min={0}
              name="energyMax"
              type="number"
            />
          </label>
          <label className="field">
            <span>Valoración mínima</span>
            <select defaultValue={query.rating ?? ""} name="rating">
              <option value="">Cualquiera</option>
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
          Limpiar
        </Link>
        <button className="button button--primary" type="submit">
          Aplicar
        </button>
      </div>
    </form>
  );
}
