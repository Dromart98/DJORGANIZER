import { createHash } from "node:crypto";
import Link from "next/link";
import {
  dedupeCrateAction,
  mergeCratesAction,
  sortCrateAction,
} from "@/app/crates/tools/actions";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { getCurrentLocale } from "@/lib/i18n/server";
import {
  compareCrateTrackIds,
  dedupeCrateByExactFingerprint,
  mergeCrateTrackIds,
  sortCrateTrackIds,
  type CrateToolSortDirection,
  type CrateToolSortField,
  type CrateToolTrack,
} from "@/lib/organization/crate-tools";
import {
  parseSmartCrateRules,
  resolveSmartCrateTrackIds,
} from "@/lib/organization/smart-crates";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 500;
const LIST_PREVIEW_LIMIT = 50;
const sortFields = ["bpm", "camelot", "energy", "rating"] as const;
const sortDirections = ["asc", "desc"] as const;

type ToolsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type CrateOption = {
  id: string;
  name: string;
  smart_rules: unknown;
};

type TrackLabel = Pick<CrateToolTrack, "artist" | "id" | "title">;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function orderDigest(trackIds: readonly string[]) {
  return createHash("sha256").update(trackIds.join("\n")).digest("hex");
}

function option(value: string | undefined, allowed: Set<string>) {
  return value && allowed.has(value) ? value : null;
}

function trackText(track: TrackLabel | undefined) {
  if (!track) return "—";
  return track.artist ? `${track.title} · ${track.artist}` : track.title;
}

function TrackList({
  ids,
  labels,
}: {
  ids: string[];
  labels: Map<string, TrackLabel>;
}) {
  if (!ids.length) return <p className="organization-muted">0</p>;
  return (
    <>
      <ol className="crate-track-list">
        {ids.slice(0, LIST_PREVIEW_LIMIT).map((id) => (
          <li key={id}>{trackText(labels.get(id))}</li>
        ))}
      </ol>
      {ids.length > LIST_PREVIEW_LIMIT ? (
        <p className="organization-muted">
          +{ids.length - LIST_PREVIEW_LIMIT} más
        </p>
      ) : null}
    </>
  );
}

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return {
    title: locale === "en" ? "Advanced crate tools" : "Herramientas avanzadas de crates",
  };
}

export default async function CrateToolsPage({ searchParams }: ToolsPageProps) {
  const [user, locale, query] = await Promise.all([
    requireUser(),
    getCurrentLocale(),
    searchParams,
  ]);
  const en = locale === "en";
  const supabase = await createClient();
  const { data: crateData, error: crateError } = await supabase
    .from("crates")
    .select("id, name, smart_rules")
    .eq("user_id", user.id)
    .order("name", { ascending: true });
  if (crateError) throw new Error("No se pudieron cargar los crates.");

  const crates = (crateData ?? []) as CrateOption[];
  const manualCrates = crates.filter((crate) => crate.smart_rules === null);
  const smartCrates = crates.filter((crate) => crate.smart_rules !== null);
  const manualIds = new Set(manualCrates.map((crate) => crate.id));
  const snapshotCache = new Map<string, string[]>();

  async function loadTrackIds(crateId: string) {
    const cached = snapshotCache.get(crateId);
    if (cached) return cached;
    const trackIds: string[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("crate_tracks")
        .select("track_id")
        .eq("crate_id", crateId)
        .eq("user_id", user.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
        .order("track_id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error("No se pudo leer el contenido del crate.");
      const rows = data ?? [];
      trackIds.push(...rows.map((row) => row.track_id));
      if (rows.length < PAGE_SIZE) break;
    }
    snapshotCache.set(crateId, trackIds);
    return trackIds;
  }

  async function loadTracks(trackIds: readonly string[]) {
    const uniqueIds = [...new Set(trackIds)];
    const tracks: CrateToolTrack[] = [];
    for (let index = 0; index < uniqueIds.length; index += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("tracks")
        .select("id, title, artist, bpm, camelot_key, energy, rating, file_fingerprint")
        .eq("user_id", user.id)
        .in("id", uniqueIds.slice(index, index + PAGE_SIZE));
      if (error) throw new Error("No se pudieron cargar las pistas.");
      tracks.push(...(data ?? []));
    }
    return tracks;
  }

  const leftId = option(first(query.left), manualIds);
  const rightId = option(first(query.right), manualIds);
  const comparison =
    leftId && rightId && leftId !== rightId
      ? compareCrateTrackIds(await loadTrackIds(leftId), await loadTrackIds(rightId))
      : null;
  const comparisonIds = comparison
    ? [...comparison.common, ...comparison.leftOnly, ...comparison.rightOnly]
    : [];
  const comparisonLabels = new Map(
    (await loadTracks(comparisonIds)).map((track) => [track.id, track]),
  );

  const mergeSourceId = option(first(query.mergeSource), manualIds);
  const mergeTargetId = option(first(query.mergeTarget), manualIds);
  let mergePreview: null | {
    addedIds: string[];
    desiredIds: string[];
    sourceDigest: string;
    sourceIds: string[];
    targetDigest: string;
    targetIds: string[];
  } = null;
  if (mergeSourceId && mergeTargetId && mergeSourceId !== mergeTargetId) {
    const [sourceIds, targetIds] = await Promise.all([
      loadTrackIds(mergeSourceId),
      loadTrackIds(mergeTargetId),
    ]);
    const desiredIds = mergeCrateTrackIds(targetIds, sourceIds);
    const targetSet = new Set(targetIds);
    mergePreview = {
      addedIds: sourceIds.filter((id) => !targetSet.has(id)),
      desiredIds,
      sourceDigest: orderDigest(sourceIds),
      sourceIds,
      targetDigest: orderDigest(targetIds),
      targetIds,
    };
  }
  const mergeLabels = new Map(
    (await loadTracks(mergePreview?.addedIds ?? [])).map((track) => [track.id, track]),
  );

  const sortCrateId = option(first(query.sortCrate), manualIds);
  const requestedField = first(query.sortField);
  const requestedDirection = first(query.sortDirection);
  const sortField = sortFields.includes(requestedField as CrateToolSortField)
    ? (requestedField as CrateToolSortField)
    : "bpm";
  const sortDirection = sortDirections.includes(
    requestedDirection as CrateToolSortDirection,
  )
    ? (requestedDirection as CrateToolSortDirection)
    : "asc";
  let sortPreview: null | {
    changedPositions: number;
    digest: string;
    sortedIds: string[];
    tracks: CrateToolTrack[];
  } = null;
  if (sortCrateId) {
    const currentIds = await loadTrackIds(sortCrateId);
    const tracks = await loadTracks(currentIds);
    const sortedIds = sortCrateTrackIds(currentIds, tracks, sortField, sortDirection);
    sortPreview = {
      changedPositions: sortedIds.filter((id, index) => currentIds[index] !== id).length,
      digest: orderDigest(currentIds),
      sortedIds,
      tracks,
    };
  }
  const sortLabels = new Map(
    (sortPreview?.tracks ?? []).map((track) => [track.id, track]),
  );

  const dedupeCrateId = option(first(query.dedupeCrate), manualIds);
  let dedupePreview: null | {
    digest: string;
    keptTrackIds: string[];
    removedTrackIds: string[];
    tracks: CrateToolTrack[];
  } = null;
  if (dedupeCrateId) {
    const currentIds = await loadTrackIds(dedupeCrateId);
    const tracks = await loadTracks(currentIds);
    const preview = dedupeCrateByExactFingerprint(currentIds, tracks);
    dedupePreview = {
      ...preview,
      digest: orderDigest(currentIds),
      tracks,
    };
  }
  const dedupeLabels = new Map(
    (dedupePreview?.tracks ?? []).map((track) => [track.id, track]),
  );

  const trackSearch = first(query.trackSearch)?.trim().slice(0, 100) ?? "";
  let trackSearchResults: TrackLabel[] = [];
  if (trackSearch) {
    const safe = trackSearch.replace(/[(),.%]/g, " ").replace(/\s+/g, " ").trim();
    if (safe) {
      const pattern = `%${safe}%`;
      const { data, error } = await supabase
        .from("tracks")
        .select("id, title, artist")
        .eq("user_id", user.id)
        .or(`title.ilike.${pattern},artist.ilike.${pattern}`)
        .order("title", { ascending: true })
        .limit(30);
      if (error) throw new Error("No se pudo buscar la pista.");
      trackSearchResults = data ?? [];
    }
  }

  const requestedTrackId = first(query.trackId);
  const { data: selectedTrack } = requestedTrackId
    ? await supabase
        .from("tracks")
        .select("id, title, artist")
        .eq("id", requestedTrackId)
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };
  let manualMemberships: CrateOption[] = [];
  const smartMemberships: CrateOption[] = [];
  if (selectedTrack) {
    const { data: membershipRows, error } = await supabase
      .from("crate_tracks")
      .select("crate_id")
      .eq("track_id", selectedTrack.id)
      .eq("user_id", user.id);
    if (error) throw new Error("No se pudieron cargar las pertenencias.");
    const memberIds = new Set((membershipRows ?? []).map((row) => row.crate_id));
    manualMemberships = manualCrates.filter((crate) => memberIds.has(crate.id));

    for (let index = 0; index < smartCrates.length; index += 8) {
      const batch = smartCrates.slice(index, index + 8);
      const matches = await Promise.all(
        batch.map(async (crate) => {
          const parsed = parseSmartCrateRules(crate.smart_rules);
          if (!parsed.success) return false;
          for (let offset = 0; ; offset += PAGE_SIZE) {
            const page = await resolveSmartCrateTrackIds(supabase, parsed.data, {
              limit: PAGE_SIZE,
              offset,
              search: selectedTrack.title,
            });
            if (page.trackIds.includes(selectedTrack.id)) return true;
            if (!page.trackIds.length || offset + page.trackIds.length >= page.count) {
              return false;
            }
          }
        }),
      );
      batch.forEach((crate, batchIndex) => {
        if (matches[batchIndex]) smartMemberships.push(crate);
      });
    }
  }

  const errorMessages: Record<string, string> = {
    changed: en
      ? "The crate changed after the preview. Review it again before applying."
      : "El crate cambió después de la previsualización. Revísalo de nuevo antes de aplicar.",
    "invalid-crate": en ? "Choose a valid manual crate." : "Elige un crate manual válido.",
    "invalid-dedupe": en ? "The duplicate cleanup is invalid." : "La limpieza de duplicados no es válida.",
    "invalid-merge": en ? "The merge selection is invalid." : "La selección de fusión no es válida.",
    "invalid-sort": en ? "The sort request is invalid." : "La ordenación no es válida.",
    "load-crate": en ? "The crate could not be loaded." : "No se pudo cargar el crate.",
    "load-tracks": en ? "The tracks could not be loaded." : "No se pudieron cargar las pistas.",
    "save-crate": en ? "The crate could not be updated." : "No se pudo actualizar el crate.",
  };
  const error = first(query.error);
  const status = error && errorMessages[error] ? errorMessages[error] : null;
  const success =
    first(query.merged) === "1"
      ? en
        ? "Crates merged. The source crate was kept unchanged."
        : "Crates fusionados. El crate de origen se ha conservado sin cambios."
      : first(query.sorted) === "1"
        ? en
          ? "The crate order was updated."
          : "El orden del crate se actualizó."
        : first(query.deduped) !== undefined
          ? Number(first(query.deduped)) > 0
            ? en
              ? `${first(query.deduped)} exact duplicates removed from the crate.`
              : `${first(query.deduped)} duplicados exactos retirados del crate.`
            : en
              ? "No exact duplicates were found."
              : "No se encontraron duplicados exactos."
          : null;

  return (
    <>
      <PageHeader
        action={
          <Link className="button button--secondary" href="/crates">
            {en ? "Back to crates" : "Volver a crates"}
          </Link>
        }
        description={
          en
            ? "Compare, merge and clean manual crates without deleting tracks from your library."
            : "Compara, fusiona y limpia crates manuales sin borrar pistas de tu biblioteca."
        }
        eyebrow={en ? "Organization" : "Organización"}
        title={en ? "Advanced crate tools" : "Herramientas avanzadas de crates"}
      />

      {status ? <p className="form-message form-message--error" role="alert">{status}</p> : null}
      {success ? <p className="form-message form-message--success" role="status">{success}</p> : null}

      <div className="settings-grid">
        <section className="card settings-card">
          <h2>{en ? "Compare crates" : "Comparar crates"}</h2>
          <p className="organization-muted">
            {en ? "See common and exclusive tracks without changing either crate." : "Muestra pistas comunes y exclusivas sin modificar ningún crate."}
          </p>
          <form method="get" className="organization-form">
            <label className="field">
              {en ? "First crate" : "Primer crate"}
              <select name="left" defaultValue={leftId ?? ""} required>
                <option value="">—</option>
                {manualCrates.map((crate) => <option key={crate.id} value={crate.id}>{crate.name}</option>)}
              </select>
            </label>
            <label className="field">
              {en ? "Second crate" : "Segundo crate"}
              <select name="right" defaultValue={rightId ?? ""} required>
                <option value="">—</option>
                {manualCrates.map((crate) => <option key={crate.id} value={crate.id}>{crate.name}</option>)}
              </select>
            </label>
            <button className="button button--secondary" type="submit">{en ? "Compare" : "Comparar"}</button>
          </form>
          {comparison ? (
            <div className="organization-layout">
              <div><h3>{en ? "Common" : "Comunes"} · {comparison.common.length}</h3><TrackList ids={comparison.common} labels={comparisonLabels} /></div>
              <div><h3>{en ? "Only first" : "Solo primer crate"} · {comparison.leftOnly.length}</h3><TrackList ids={comparison.leftOnly} labels={comparisonLabels} /></div>
              <div><h3>{en ? "Only second" : "Solo segundo crate"} · {comparison.rightOnly.length}</h3><TrackList ids={comparison.rightOnly} labels={comparisonLabels} /></div>
            </div>
          ) : null}
        </section>

        <section className="card settings-card">
          <h2>{en ? "Merge crates" : "Fusionar crates"}</h2>
          <p className="organization-muted">
            {en ? "Preview the union first. Target order is preserved, new source tracks are appended, and the source crate remains unchanged." : "Previsualiza primero la unión. Se conserva el orden del destino, se añaden al final las pistas nuevas del origen y el crate de origen no se modifica."}
          </p>
          <form method="get" className="organization-form">
            <label className="field">{en ? "Source" : "Origen"}<select name="mergeSource" defaultValue={mergeSourceId ?? ""} required><option value="">—</option>{manualCrates.map((crate) => <option key={crate.id} value={crate.id}>{crate.name}</option>)}</select></label>
            <label className="field">{en ? "Target" : "Destino"}<select name="mergeTarget" defaultValue={mergeTargetId ?? ""} required><option value="">—</option>{manualCrates.map((crate) => <option key={crate.id} value={crate.id}>{crate.name}</option>)}</select></label>
            <button className="button button--secondary" type="submit">{en ? "Preview merge" : "Previsualizar fusión"}</button>
          </form>
          {mergePreview && mergeSourceId && mergeTargetId ? (
            <div className="organization-form">
              <p><strong>{mergePreview.addedIds.length}</strong> {en ? "new tracks will be added; final total" : "pistas nuevas se añadirán; total final"}: <strong>{mergePreview.desiredIds.length}</strong>.</p>
              <TrackList ids={mergePreview.addedIds} labels={mergeLabels} />
              <form action={mergeCratesAction}>
                <input type="hidden" name="sourceId" value={mergeSourceId} />
                <input type="hidden" name="targetId" value={mergeTargetId} />
                <input type="hidden" name="sourceDigest" value={mergePreview.sourceDigest} />
                <input type="hidden" name="targetDigest" value={mergePreview.targetDigest} />
                <button className="button button--primary" type="submit">{en ? "Apply merge" : "Aplicar fusión"}</button>
              </form>
            </div>
          ) : null}
        </section>

        <section className="card settings-card">
          <h2>{en ? "Sort crate" : "Ordenar crate"}</h2>
          <p className="organization-muted">{en ? "Sorting changes the persistent crate order, so the proposed order is shown before applying." : "La ordenación cambia el orden persistente del crate, por eso se muestra la propuesta antes de aplicarla."}</p>
          <form method="get" className="organization-form">
            <label className="field">Crate<select name="sortCrate" defaultValue={sortCrateId ?? ""} required><option value="">—</option>{manualCrates.map((crate) => <option key={crate.id} value={crate.id}>{crate.name}</option>)}</select></label>
            <label className="field">{en ? "Field" : "Campo"}<select name="sortField" defaultValue={sortField}><option value="bpm">BPM</option><option value="camelot">Camelot</option><option value="energy">{en ? "Energy" : "Energía"}</option><option value="rating">{en ? "Rating" : "Valoración"}</option></select></label>
            <label className="field">{en ? "Direction" : "Dirección"}<select name="sortDirection" defaultValue={sortDirection}><option value="asc">{en ? "Ascending" : "Ascendente"}</option><option value="desc">{en ? "Descending" : "Descendente"}</option></select></label>
            <button className="button button--secondary" type="submit">{en ? "Preview order" : "Previsualizar orden"}</button>
          </form>
          {sortPreview && sortCrateId ? (
            <div className="organization-form">
              <p>{sortPreview.changedPositions} {en ? "positions would change." : "posiciones cambiarían."}</p>
              <TrackList ids={sortPreview.sortedIds} labels={sortLabels} />
              <form action={sortCrateAction}>
                <input type="hidden" name="crateId" value={sortCrateId} />
                <input type="hidden" name="field" value={sortField} />
                <input type="hidden" name="direction" value={sortDirection} />
                <input type="hidden" name="digest" value={sortPreview.digest} />
                <button className="button button--primary" disabled={sortPreview.changedPositions === 0} type="submit">{en ? "Apply order" : "Aplicar orden"}</button>
              </form>
            </div>
          ) : null}
        </section>

        <section className="card settings-card">
          <h2>{en ? "Remove internal duplicates" : "Retirar duplicados internos"}</h2>
          <p className="organization-muted">{en ? "Only exact file-fingerprint duplicates are removed from the crate. The library tracks are never deleted." : "Solo se retiran del crate duplicados con huella de archivo exacta. Las pistas nunca se borran de la biblioteca."}</p>
          <form method="get" className="organization-form">
            <label className="field">Crate<select name="dedupeCrate" defaultValue={dedupeCrateId ?? ""} required><option value="">—</option>{manualCrates.map((crate) => <option key={crate.id} value={crate.id}>{crate.name}</option>)}</select></label>
            <button className="button button--secondary" type="submit">{en ? "Preview cleanup" : "Previsualizar limpieza"}</button>
          </form>
          {dedupePreview && dedupeCrateId ? (
            <div className="organization-form">
              <p><strong>{dedupePreview.removedTrackIds.length}</strong> {en ? "exact duplicates found." : "duplicados exactos encontrados."}</p>
              <TrackList ids={dedupePreview.removedTrackIds} labels={dedupeLabels} />
              <form action={dedupeCrateAction}>
                <input type="hidden" name="crateId" value={dedupeCrateId} />
                <input type="hidden" name="digest" value={dedupePreview.digest} />
                <button className="button button--primary" disabled={dedupePreview.removedTrackIds.length === 0} type="submit">{en ? "Remove from crate" : "Retirar del crate"}</button>
              </form>
            </div>
          ) : null}
        </section>

        <section className="card settings-card">
          <h2>{en ? "Where is a track used?" : "¿En qué crates aparece una pista?"}</h2>
          <form method="get" className="organization-form">
            <label className="field">{en ? "Title or artist" : "Título o artista"}<input name="trackSearch" defaultValue={trackSearch} maxLength={100} /></label>
            <button className="button button--secondary" type="submit">{en ? "Search" : "Buscar"}</button>
          </form>
          {trackSearchResults.length ? (
            <ul className="tag-list">
              {trackSearchResults.map((track) => (
                <li key={track.id}><span>{trackText(track)}</span><Link className="table-action" href={`/crates/tools?trackId=${track.id}`}>{en ? "Show crates" : "Ver crates"}</Link></li>
              ))}
            </ul>
          ) : trackSearch ? <p className="organization-muted">{en ? "No matching tracks." : "No hay pistas coincidentes."}</p> : null}
          {selectedTrack ? (
            <div className="organization-form">
              <h3>{trackText(selectedTrack)}</h3>
              <p><strong>{en ? "Manual crates" : "Crates manuales"}</strong></p>
              {manualMemberships.length ? <ul className="tag-list">{manualMemberships.map((crate) => <li key={crate.id}><Link href={`/crates/${crate.id}`}>{crate.name}</Link></li>)}</ul> : <p className="organization-muted">0</p>}
              <p><strong>{en ? "Smart crates currently matching" : "Crates inteligentes que coinciden ahora"}</strong></p>
              {smartMemberships.length ? <ul className="tag-list">{smartMemberships.map((crate) => <li key={crate.id}><Link href={`/crates/${crate.id}`}>{crate.name}</Link></li>)}</ul> : <p className="organization-muted">0</p>}
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}
