import Link from "next/link";
import { mergeManualCratesAction } from "@/app/crates/merge/actions";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { getCurrentLocale } from "@/lib/i18n/server";
import {
  mergeCrateTrackIds,
  resolveComparableCrateTrackIds,
  type ComparableCrate,
} from "@/lib/organization/crate-comparison";
import { crateOrderDigest } from "@/lib/organization/crate-merge";
import { createClient } from "@/lib/supabase/server";

const PREVIEW_LIMIT = 100;

type MergeCratesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return { title: locale === "en" ? "Merge crates" : "Fusionar crates" };
}

export default async function MergeCratesPage({ searchParams }: MergeCratesPageProps) {
  const [user, locale, query] = await Promise.all([
    requireUser(),
    getCurrentLocale(),
    searchParams,
  ]);
  const en = locale === "en";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crates")
    .select("id, name, smart_rules")
    .eq("user_id", user.id)
    .order("name", { ascending: true })
    .limit(500);
  if (error) throw new Error("No se pudieron cargar los crates.");

  const crates = ((data ?? []) as ComparableCrate[]).filter(
    (crate) => crate.smart_rules === null,
  );
  const byId = new Map(crates.map((crate) => [crate.id, crate]));
  const source = byId.get(first(query.source) ?? "");
  const target = byId.get(first(query.target) ?? "");
  const sameCrate = Boolean(source && target && source.id === target.id);

  let preview:
    | {
        addedTrackIds: string[];
        finalCount: number;
        sourceDigest: string;
        sourceTrackCount: number;
        targetDigest: string;
        targetTrackCount: number;
        tracks: Array<{ artist: string | null; id: string; title: string }>;
      }
    | undefined;

  if (source && target && !sameCrate) {
    const [sourceTrackIds, targetTrackIds] = await Promise.all([
      resolveComparableCrateTrackIds(supabase, user.id, source),
      resolveComparableCrateTrackIds(supabase, user.id, target),
    ]);
    const targetSet = new Set(targetTrackIds);
    const addedTrackIds = sourceTrackIds.filter((id) => !targetSet.has(id));
    const mergedTrackIds = mergeCrateTrackIds(targetTrackIds, sourceTrackIds);
    const visibleIds = addedTrackIds.slice(0, PREVIEW_LIMIT);
    const { data: trackData, error: tracksError } = visibleIds.length
      ? await supabase
          .from("tracks")
          .select("id, title, artist")
          .eq("user_id", user.id)
          .in("id", visibleIds)
      : { data: [], error: null };
    if (tracksError) throw new Error("No se pudo preparar la previsualización.");
    const labels = new Map((trackData ?? []).map((track) => [track.id, track]));

    preview = {
      addedTrackIds,
      finalCount: mergedTrackIds.length,
      sourceDigest: crateOrderDigest(sourceTrackIds),
      sourceTrackCount: sourceTrackIds.length,
      targetDigest: crateOrderDigest(targetTrackIds),
      targetTrackCount: targetTrackIds.length,
      tracks: visibleIds.flatMap((id) => labels.get(id) ?? []),
    };
  }

  const errors: Record<string, string> = {
    changed: en
      ? "One of the crates changed after the preview. Review the merge again."
      : "Uno de los crates cambió después de la previsualización. Revisa de nuevo la fusión.",
    invalid: en ? "Choose two valid crates." : "Elige dos crates válidos.",
    limit: en
      ? "The merged crate would exceed the safe limit of 20,000 tracks."
      : "El crate fusionado superaría el límite seguro de 20.000 pistas.",
    "manual-only": en
      ? "Only manual crates can be merged."
      : "Solo se pueden fusionar crates manuales.",
    save: en ? "The crates could not be merged." : "No se pudieron fusionar los crates.",
  };
  const requestedError = first(query.error);
  const errorMessage = requestedError ? errors[requestedError] : null;
  const merged = first(query.merged) === "1";

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
            ? "Preview the union first. The target keeps its order, source-only tracks are appended, and the source crate is left unchanged."
            : "Previsualiza primero la unión. El destino conserva su orden, las pistas exclusivas del origen se añaden al final y el crate de origen no se modifica."
        }
        eyebrow={en ? "Organization" : "Organización"}
        title={en ? "Merge crates" : "Fusionar crates"}
      />

      {errorMessage ? (
        <p className="form-message form-message--error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {merged ? (
        <p className="form-message form-message--success" role="status">
          {en
            ? "Crates merged. The source crate was preserved."
            : "Crates fusionados. El crate de origen se ha conservado."}
        </p>
      ) : null}

      {crates.length < 2 ? (
        <div className="card">
          <p>
            {en
              ? "Create at least two manual crates before merging them."
              : "Crea al menos dos crates manuales antes de fusionarlos."}
          </p>
        </div>
      ) : (
        <form className="card library-filters" method="get">
          <div className="filter-primary">
            <label className="field">
              <span>{en ? "Source crate" : "Crate de origen"}</span>
              <select defaultValue={source?.id ?? ""} name="source" required>
                <option disabled value="">—</option>
                {crates.map((crate) => (
                  <option key={crate.id} value={crate.id}>
                    {crate.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{en ? "Target crate" : "Crate de destino"}</span>
              <select defaultValue={target?.id ?? ""} name="target" required>
                <option disabled value="">—</option>
                {crates.map((crate) => (
                  <option key={crate.id} value={crate.id}>
                    {crate.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="filter-actions">
            <button className="button button--primary" type="submit">
              {en ? "Preview merge" : "Previsualizar fusión"}
            </button>
          </div>
        </form>
      )}

      {sameCrate ? (
        <p className="form-message form-message--error" role="alert">
          {en ? "Choose two different crates." : "Selecciona dos crates diferentes."}
        </p>
      ) : null}

      {preview && source && target ? (
        <section className="card stack">
          <div className="organization-section-heading">
            <div>
              <p className="eyebrow">{en ? "Preview" : "Previsualización"}</p>
              <h2>
                {source.name} → {target.name}
              </h2>
            </div>
            <span>{preview.finalCount}</span>
          </div>
          <p>
            {en
              ? `${target.name} keeps its ${preview.targetTrackCount} tracks in the same order. ${preview.addedTrackIds.length} new tracks from ${source.name} will be appended.`
              : `${target.name} conserva sus ${preview.targetTrackCount} pistas en el mismo orden. Se añadirán al final ${preview.addedTrackIds.length} pistas nuevas de ${source.name}.`}
          </p>
          <p className="organization-muted">
            {en
              ? `Source crate: ${preview.sourceTrackCount} tracks. It will not be modified.`
              : `Crate de origen: ${preview.sourceTrackCount} pistas. No se modificará.`}
          </p>

          {preview.tracks.length ? (
            <ol className="crate-track-list">
              {preview.tracks.map((track) => (
                <li key={track.id}>
                  {track.title}
                  {track.artist ? ` · ${track.artist}` : ""}
                </li>
              ))}
            </ol>
          ) : (
            <p className="organization-muted">
              {en
                ? "The target already contains every source track."
                : "El destino ya contiene todas las pistas del origen."}
            </p>
          )}
          {preview.addedTrackIds.length > PREVIEW_LIMIT ? (
            <p className="organization-muted">
              +{preview.addedTrackIds.length - PREVIEW_LIMIT} {en ? "more" : "más"}
            </p>
          ) : null}

          <form action={mergeManualCratesAction}>
            <input name="sourceId" type="hidden" value={source.id} />
            <input name="targetId" type="hidden" value={target.id} />
            <input name="sourceDigest" type="hidden" value={preview.sourceDigest} />
            <input name="targetDigest" type="hidden" value={preview.targetDigest} />
            <button
              className="button button--primary"
              disabled={preview.addedTrackIds.length === 0}
              type="submit"
            >
              {en ? "Apply merge" : "Aplicar fusión"}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}
