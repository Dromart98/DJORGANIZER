import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { getCurrentLocale } from "@/lib/i18n/server";
import {
  compareCrateTrackIds,
  resolveComparableCrateTrackIds,
  type ComparableCrate,
} from "@/lib/organization/crate-comparison";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

const MAX_VISIBLE_PER_SECTION = 200;

type ComparePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ComparisonTrack = Pick<
  Tables<"tracks">,
  "id" | "title" | "artist" | "bpm" | "camelot_key" | "energy" | "rating"
>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function loadTracks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  trackIds: string[],
) {
  const rows: ComparisonTrack[] = [];
  const uniqueIds = [...new Set(trackIds)];
  for (let start = 0; start < uniqueIds.length; start += 100) {
    const chunk = uniqueIds.slice(start, start + 100);
    const { data, error } = await supabase
      .from("tracks")
      .select("id, title, artist, bpm, camelot_key, energy, rating")
      .eq("user_id", userId)
      .in("id", chunk);
    if (error) throw new Error("No se pudieron cargar las pistas comparadas.");
    rows.push(...(data ?? []));
  }
  return new Map(rows.map((track) => [track.id, track]));
}

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return { title: locale === "en" ? "Compare crates" : "Comparar crates" };
}

export default async function CompareCratesPage({ searchParams }: ComparePageProps) {
  const [user, query, locale] = await Promise.all([
    requireUser(),
    searchParams,
    getCurrentLocale(),
  ]);
  const supabase = await createClient();
  const { data: crateData, error: cratesError } = await supabase
    .from("crates")
    .select("id, name, smart_rules")
    .eq("user_id", user.id)
    .order("name", { ascending: true })
    .limit(500);
  if (cratesError) throw new Error("No se pudieron cargar los crates.");

  const crates = ((crateData ?? []) as ComparableCrate[]).filter(
    (crate) => crate.smart_rules === null,
  );
  const byId = new Map(crates.map((crate) => [crate.id, crate]));
  const leftId = firstValue(query.left);
  const rightId = firstValue(query.right);
  const left = leftId ? byId.get(leftId) : undefined;
  const right = rightId ? byId.get(rightId) : undefined;
  const sameCrate = Boolean(left && right && left.id === right.id);

  let comparison:
    | {
        common: ComparisonTrack[];
        commonCount: number;
        leftOnly: ComparisonTrack[];
        leftOnlyCount: number;
        rightOnly: ComparisonTrack[];
        rightOnlyCount: number;
      }
    | undefined;

  if (left && right && !sameCrate) {
    const [leftTrackIds, rightTrackIds] = await Promise.all([
      resolveComparableCrateTrackIds(supabase, user.id, left),
      resolveComparableCrateTrackIds(supabase, user.id, right),
    ]);
    const ids = compareCrateTrackIds(leftTrackIds, rightTrackIds);
    const visibleIds = [
      ...ids.common.slice(0, MAX_VISIBLE_PER_SECTION),
      ...ids.leftOnly.slice(0, MAX_VISIBLE_PER_SECTION),
      ...ids.rightOnly.slice(0, MAX_VISIBLE_PER_SECTION),
    ];
    const tracks = await loadTracks(supabase, user.id, visibleIds);
    const ordered = (trackIds: string[]) =>
      trackIds
        .slice(0, MAX_VISIBLE_PER_SECTION)
        .flatMap((id) => tracks.get(id) ?? []);

    comparison = {
      common: ordered(ids.common),
      commonCount: ids.common.length,
      leftOnly: ordered(ids.leftOnly),
      leftOnlyCount: ids.leftOnly.length,
      rightOnly: ordered(ids.rightOnly),
      rightOnlyCount: ids.rightOnly.length,
    };
  }

  const text =
    locale === "en"
      ? {
          back: "Back to crates",
          compare: "Compare",
          description:
            "See which tracks two manual crates share and which belong only to one of them.",
          first: "First crate",
          same: "Choose two different crates.",
          second: "Second crate",
          title: "Compare crates",
          tooFew: "Create at least two manual crates before comparing them.",
        }
      : {
          back: "Volver a crates",
          compare: "Comparar",
          description:
            "Comprueba qué pistas comparten dos crates manuales y cuáles pertenecen solo a uno de ellos.",
          first: "Primer crate",
          same: "Selecciona dos crates diferentes.",
          second: "Segundo crate",
          title: "Comparar crates",
          tooFew: "Crea al menos dos crates manuales antes de compararlos.",
        };

  return (
    <>
      <PageHeader
        description={text.description}
        eyebrow={locale === "en" ? "Organization" : "Organización"}
        title={text.title}
      />

      <p>
        <Link className="button button--secondary" href="/crates">
          {text.back}
        </Link>
      </p>

      {crates.length < 2 ? (
        <div className="card">
          <p>{text.tooFew}</p>
        </div>
      ) : (
        <form className="card library-filters" method="get">
          <div className="filter-primary">
            <label className="field">
              <span>{text.first}</span>
              <select defaultValue={left?.id ?? ""} name="left" required>
                <option disabled value="">—</option>
                {crates.map((crate) => (
                  <option key={crate.id} value={crate.id}>
                    {crate.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{text.second}</span>
              <select defaultValue={right?.id ?? ""} name="right" required>
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
              {text.compare}
            </button>
          </div>
        </form>
      )}

      {sameCrate ? (
        <p className="form-message form-message--error" role="alert">
          {text.same}
        </p>
      ) : null}

      {comparison && left && right ? (
        <div className="stack">
          <ComparisonSection
            count={comparison.commonCount}
            emptyLabel={locale === "en" ? "No shared tracks." : "No hay pistas comunes."}
            locale={locale}
            title={locale === "en" ? "In both crates" : "En ambos crates"}
            tracks={comparison.common}
          />
          <ComparisonSection
            count={comparison.leftOnlyCount}
            emptyLabel={locale === "en" ? "No exclusive tracks." : "No hay pistas exclusivas."}
            locale={locale}
            title={locale === "en" ? `Only in ${left.name}` : `Solo en ${left.name}`}
            tracks={comparison.leftOnly}
          />
          <ComparisonSection
            count={comparison.rightOnlyCount}
            emptyLabel={locale === "en" ? "No exclusive tracks." : "No hay pistas exclusivas."}
            locale={locale}
            title={locale === "en" ? `Only in ${right.name}` : `Solo en ${right.name}`}
            tracks={comparison.rightOnly}
          />
        </div>
      ) : null}
    </>
  );
}

function ComparisonSection({
  count,
  emptyLabel,
  locale,
  title,
  tracks,
}: {
  count: number;
  emptyLabel: string;
  locale: "en" | "es";
  title: string;
  tracks: ComparisonTrack[];
}) {
  return (
    <section className="card">
      <div className="organization-section-heading">
        <h2>{title}</h2>
        <span>{count}</span>
      </div>
      {count > MAX_VISIBLE_PER_SECTION ? (
        <p className="organization-muted">
          {locale === "en"
            ? `Showing the first ${MAX_VISIBLE_PER_SECTION} of ${count}.`
            : `Mostrando las primeras ${MAX_VISIBLE_PER_SECTION} de ${count}.`}
        </p>
      ) : null}
      {tracks.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{locale === "en" ? "Title" : "Título"}</th>
                <th>{locale === "en" ? "Artist" : "Artista"}</th>
                <th>BPM</th>
                <th>Camelot</th>
                <th>{locale === "en" ? "Energy" : "Energía"}</th>
                <th>{locale === "en" ? "Rating" : "Valoración"}</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <tr key={track.id}>
                  <td>
                    <Link className="table-action" href={`/library/${track.id}`}>
                      {track.title}
                    </Link>
                  </td>
                  <td>{track.artist ?? "—"}</td>
                  <td>{track.bpm ?? "—"}</td>
                  <td>{track.camelot_key ?? "—"}</td>
                  <td>{track.energy ?? "—"}</td>
                  <td>{track.rating === null ? "—" : `${track.rating}/5`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="organization-muted">{emptyLabel}</p>
      )}
    </section>
  );
}
