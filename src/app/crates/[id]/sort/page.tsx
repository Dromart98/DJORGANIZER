import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { sortManualCrateAction } from "@/app/crates/[id]/sort/actions";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { getCurrentLocale } from "@/lib/i18n/server";
import {
  resolveComparableCrateTrackIds,
  type ComparableCrate,
} from "@/lib/organization/crate-comparison";
import { crateOrderDigest } from "@/lib/organization/crate-merge";
import {
  isCrateSortDirection,
  isCrateSortKey,
  loadCrateSortTracks,
  sortCrateTracks,
  type CrateSortKey,
  type CrateSortTrack,
} from "@/lib/organization/crate-sort";
import { organizationIdSchema } from "@/lib/organization/schemas";
import { createClient } from "@/lib/supabase/server";

const PREVIEW_LIMIT = 100;

type SortCratePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sortValue(track: CrateSortTrack, key: CrateSortKey, en: boolean) {
  switch (key) {
    case "bpm":
      return track.bpm === null ? "—" : `${track.bpm} BPM`;
    case "camelot":
      return track.camelot_key ?? "—";
    case "energy":
      return track.energy === null ? "—" : `${track.energy}/10`;
    case "genre":
      return track.genre ?? "—";
    case "subgenre":
      return track.subgenre ?? "—";
    case "rating":
      return track.rating === null
        ? en
          ? "Unrated"
          : "Sin valorar"
        : `${track.rating}/5`;
  }
}

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return { title: locale === "en" ? "Sort crate" : "Ordenar crate" };
}

export default async function SortCratePage({
  params,
  searchParams,
}: SortCratePageProps) {
  const [user, locale, query] = await Promise.all([
    requireUser(),
    getCurrentLocale(),
    searchParams,
  ]);
  const en = locale === "en";
  const { id } = await params;
  const parsedId = organizationIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crates")
    .select("id, name, smart_rules")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("No se pudo cargar el crate.");
  if (!data) notFound();

  const crate = data as ComparableCrate;
  if (crate.smart_rules !== null) redirect(`/crates/${crate.id}`);

  const currentTrackIds = await resolveComparableCrateTrackIds(
    supabase,
    user.id,
    crate,
  );
  const currentTracks = await loadCrateSortTracks(
    supabase,
    user.id,
    currentTrackIds,
  );

  const requestedKey = first(query.key);
  const requestedDirection = first(query.direction);
  const key = isCrateSortKey(requestedKey) ? requestedKey : undefined;
  const direction = isCrateSortDirection(requestedDirection)
    ? requestedDirection
    : undefined;
  const preview =
    key && direction ? sortCrateTracks(currentTracks, key, direction) : undefined;
  const previewTrackIds = preview?.map(({ id: trackId }) => trackId) ?? [];
  const changedPositions = preview
    ? previewTrackIds.reduce(
        (count, trackId, index) =>
          count + (currentTrackIds[index] === trackId ? 0 : 1),
        0,
      )
    : 0;

  const errors: Record<string, string> = {
    changed: en
      ? "The crate or the values used for sorting changed after the preview. Review the order again."
      : "El crate o los valores usados para ordenar cambiaron después de la previsualización. Revisa de nuevo el orden.",
    invalid: en ? "The crate is not available." : "El crate no está disponible.",
    limit: en
      ? "This crate exceeds the safe limit of 20,000 tracks."
      : "Este crate supera el límite seguro de 20.000 pistas.",
    "manual-only": en
      ? "Only manual crates can be reordered."
      : "Solo se pueden reordenar crates manuales.",
    save: en ? "The new order could not be saved." : "No se pudo guardar el nuevo orden.",
  };
  const requestedError = first(query.error);
  const errorMessage = requestedError ? errors[requestedError] : null;
  const sorted = first(query.sorted) === "1";

  return (
    <>
      <PageHeader
        action={
          <Link className="button button--secondary" href={`/crates/${crate.id}`}>
            {en ? "Back to crate" : "Volver al crate"}
          </Link>
        }
        description={
          en
            ? "Preview the complete order before applying it. Empty values stay at the end and ties keep their current relative order."
            : "Previsualiza el orden completo antes de aplicarlo. Los valores vacíos quedan al final y los empates conservan su orden relativo actual."
        }
        eyebrow={en ? "Organization" : "Organización"}
        title={en ? `Sort ${crate.name}` : `Ordenar ${crate.name}`}
      />

      {errorMessage ? (
        <p className="form-message form-message--error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {sorted ? (
        <p className="form-message form-message--success" role="status">
          {en ? "The new crate order was saved." : "El nuevo orden del crate se ha guardado."}
        </p>
      ) : null}

      <form className="card library-filters" method="get">
        <div className="filter-primary">
          <label className="field">
            <span>{en ? "Sort by" : "Ordenar por"}</span>
            <select defaultValue={key ?? "bpm"} name="key">
              <option value="bpm">BPM</option>
              <option value="camelot">Camelot</option>
              <option value="energy">{en ? "Energy" : "Energía"}</option>
              <option value="genre">{en ? "Genre" : "Género"}</option>
              <option value="subgenre">{en ? "Subgenre" : "Subgénero"}</option>
              <option value="rating">{en ? "Rating" : "Valoración"}</option>
            </select>
          </label>
          <label className="field">
            <span>{en ? "Direction" : "Dirección"}</span>
            <select defaultValue={direction ?? "asc"} name="direction">
              <option value="asc">{en ? "Ascending" : "Ascendente"}</option>
              <option value="desc">{en ? "Descending" : "Descendente"}</option>
            </select>
          </label>
        </div>
        <div className="filter-actions">
          <button className="button button--primary" type="submit">
            {en ? "Preview order" : "Previsualizar orden"}
          </button>
        </div>
      </form>

      {!currentTrackIds.length ? (
        <div className="card">
          <p>{en ? "This crate is empty." : "Este crate está vacío."}</p>
        </div>
      ) : null}

      {currentTrackIds.length > 20000 ? (
        <p className="form-message form-message--error" role="alert">
          {errors.limit}
        </p>
      ) : null}

      {preview && key && direction ? (
        <section className="card stack">
          <div className="organization-section-heading">
            <div>
              <p className="eyebrow">{en ? "Preview" : "Previsualización"}</p>
              <h2>
                {en ? "Resulting order" : "Orden resultante"} · {preview.length}
              </h2>
            </div>
            <span>
              {changedPositions} {en ? "positions change" : "posiciones cambian"}
            </span>
          </div>

          <ol className="crate-track-list">
            {preview.slice(0, PREVIEW_LIMIT).map((track, index) => (
              <li className="card crate-track" key={track.id}>
                <span className="crate-track__position">{index + 1}</span>
                <div>
                  <strong>{track.title}</strong>
                  <span>{track.artist ?? (en ? "Unknown artist" : "Artista desconocido")}</span>
                  <small>{sortValue(track, key, en)}</small>
                </div>
              </li>
            ))}
          </ol>
          {preview.length > PREVIEW_LIMIT ? (
            <p className="organization-muted">
              +{preview.length - PREVIEW_LIMIT} {en ? "more tracks" : "pistas más"}
            </p>
          ) : null}

          <form action={sortManualCrateAction}>
            <input name="crateId" type="hidden" value={crate.id} />
            <input name="sortKey" type="hidden" value={key} />
            <input name="direction" type="hidden" value={direction} />
            <input
              name="currentDigest"
              type="hidden"
              value={crateOrderDigest(currentTrackIds)}
            />
            <input
              name="sortedDigest"
              type="hidden"
              value={crateOrderDigest(previewTrackIds)}
            />
            <button
              className="button button--primary"
              disabled={
                changedPositions === 0 || currentTrackIds.length > 20000
              }
              type="submit"
            >
              {en ? "Apply order" : "Aplicar orden"}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
