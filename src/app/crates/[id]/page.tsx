import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  addTrackToCrateAction,
  moveTrackInCrateAction,
  removeTrackFromCrateAction,
  updateCrateAction,
} from "@/app/crates/actions";
import { DeleteCrateForm } from "@/components/organization/delete-organization-forms";
import { SmartCrateDetail } from "@/components/organization/smart-crate-detail";
import { DesktopExportLink } from "@/components/desktop/desktop-export-link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { formatMessage, formatTrackCount, translate } from "@/lib/i18n/functional";
import type { Locale } from "@/lib/i18n/i18n";
import { getCurrentLocale } from "@/lib/i18n/server";
import { safeSearchTerm } from "@/lib/library/track-query";
import { organizationIdSchema } from "@/lib/organization/schemas";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/tracks";
import type { Tables } from "@/types/database";

type CrateDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type CrateMembership = Pick<
  Tables<"crate_tracks">,
  "position" | "track_id"
>;

const CRATE_TRACKS_PER_PAGE = 100;
const CRATE_EXPORT_TRACKS_PER_PAGE = 500;

const errorMessages: Record<string, string> = {
  "add-track": "No se pudo añadir la pista.",
  "delete-crate": "No se pudo eliminar el crate.",
  "duplicate-crate": "Ya tienes otro crate con ese nombre.",
  "duplicate-track": "Esa pista ya forma parte del crate.",
  "remove-track": "No se pudo quitar la pista.",
  reorder: "No se pudo cambiar el orden.",
  "save-crate": "No se pudieron guardar los cambios.",
};

function trackSummary(locale: Locale, track: Tables<"tracks">) {
  const duration =
    track.duration_seconds === null
      ? translate(locale, "Duración —")
      : formatDuration(Math.round(track.duration_seconds));
  return `${track.bpm ? `${track.bpm} BPM` : "BPM —"} · ${
    track.musical_key ?? `${translate(locale, "Tonalidad")} —`
  } · ${duration}`;
}

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return { title: translate(locale, "Detalle de crate") };
}

export default async function CrateDetailPage({
  params,
  searchParams,
}: CrateDetailPageProps) {
  const [user, locale] = await Promise.all([requireUser(), getCurrentLocale()]);
  const t = (message: Parameters<typeof translate>[1]) =>
    translate(locale, message);
  const { id } = await params;
  const parsedId = organizationIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const requestedPage =
    typeof query.cratePage === "string" &&
    Number.isInteger(Number(query.cratePage)) &&
    Number(query.cratePage) > 0
      ? Number(query.cratePage)
      : 1;
  const rangeFrom = (requestedPage - 1) * CRATE_TRACKS_PER_PAGE;
  const rangeTo = rangeFrom + CRATE_TRACKS_PER_PAGE - 1;
  const supabase = await createClient();
  const [
    { data: crate, error: crateError },
    {
      count: membershipCount,
      data: memberships,
      error: memberError,
    },
    { data: allCrates, error: allCratesError },
  ] =
    await Promise.all([
      supabase
        .from("crates")
        .select("*")
        .eq("id", parsedId.data)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("crate_tracks")
        .select("track_id, position", { count: "exact" })
        .eq("crate_id", parsedId.data)
        .eq("user_id", user.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
        .order("track_id", { ascending: true })
        .range(rangeFrom, rangeTo),
      supabase
        .from("crates")
        .select("id, name, parent_id")
        .eq("user_id", user.id)
        .order("name"),
    ]);

  if (crateError || memberError || allCratesError) {
    throw new Error("No se pudo cargar el crate.");
  }
  if (!crate) notFound();
  if (crate.smart_rules !== null) {
    return (
      <SmartCrateDetail
        allCrates={allCrates ?? []}
        crate={crate}
        locale={locale}
        requestedPage={requestedPage}
        search={search}
        userId={user.id}
      />
    );
  }
  const totalMemberships = membershipCount ?? 0;
  const cratePageCount = Math.max(
    1,
    Math.ceil(totalMemberships / CRATE_TRACKS_PER_PAGE),
  );
  if (totalMemberships > 0 && requestedPage > cratePageCount) {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("cratePage", String(cratePageCount));
    redirect(`/crates/${crate.id}?${params.toString()}`);
  }

  const membershipRows: CrateMembership[] = memberships ?? [];
  const exportTrackIds: string[] = [];
  for (let from = 0; from < totalMemberships; from += CRATE_EXPORT_TRACKS_PER_PAGE) {
    const { data, error: allMembershipsError } = await supabase
      .from("crate_tracks")
      .select("track_id")
      .eq("crate_id", crate.id)
      .eq("user_id", user.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .order("track_id", { ascending: true })
      .range(from, from + CRATE_EXPORT_TRACKS_PER_PAGE - 1);
    if (allMembershipsError) throw new Error("No se pudo preparar la exportación del crate.");
    exportTrackIds.push(...(data ?? []).map((membership) => membership.track_id));
  }
  const memberIds = membershipRows.map((membership) => membership.track_id);
  const { data: memberTracks, error: tracksError } = memberIds.length
    ? await supabase
        .from("tracks")
        .select("*")
        .eq("user_id", user.id)
        .in("id", memberIds)
    : { data: [], error: null };
  if (tracksError) throw new Error("No se pudieron cargar las pistas.");

  const memberTrackRows: Tables<"tracks">[] = memberTracks ?? [];
  const tracksById = new Map(
    memberTrackRows.map((track: Tables<"tracks">) => [track.id, track]),
  );
  const orderedTracks = membershipRows.flatMap((membership) => {
    const track = tracksById.get(membership.track_id);
    return track ? [track] : [];
  });

  let availableRequest = supabase
    .from("tracks")
    .select("*")
    .eq("user_id", user.id)
    .order("title", { ascending: true })
    .limit(100);
  const safeSearch = search ? safeSearchTerm(search) : "";
  if (safeSearch) {
    const pattern = `%${safeSearch}%`;
    availableRequest = availableRequest.or(
      `title.ilike.${pattern},artist.ilike.${pattern}`,
    );
  }
  const { data: candidates, error: candidatesError } = await availableRequest;
  if (candidatesError) {
    throw new Error("No se pudo buscar en la biblioteca.");
  }
  const candidateRows: Tables<"tracks">[] = candidates ?? [];
  const candidateIds = candidateRows.map((track) => track.id);
  const { data: existingCandidates, error: existingCandidatesError } =
    candidateIds.length
      ? await supabase
          .from("crate_tracks")
          .select("track_id")
          .eq("crate_id", crate.id)
          .eq("user_id", user.id)
          .in("track_id", candidateIds)
      : { data: [], error: null };
  if (existingCandidatesError) {
    throw new Error("No se pudo comprobar el contenido del crate.");
  }
  const memberSet = new Set(
    (existingCandidates ?? []).map((membership) => membership.track_id),
  );
  const availableTracks = candidateRows.filter(
    (track: Tables<"tracks">) => !memberSet.has(track.id),
  );

  const error =
    typeof query.error === "string" && errorMessages[query.error]
      ? t(errorMessages[query.error] as Parameters<typeof translate>[1])
      : null;
  const success =
    query.created === "1"
      ? t("El crate se creó correctamente.")
      : query.updated === "1"
        ? t("Los cambios se guardaron.")
        : query.trackAdded === "1"
          ? t("La pista se añadió al final del crate.")
          : query.trackRemoved === "1"
            ? t("La pista se quitó del crate.")
            : null;

  return (
    <>
      <PageHeader
        action={
          <DeleteCrateForm
            crateId={crate.id}
            name={crate.name}
            revision={crate.updated_at}
          />
        }
        description={
          crate.description ||
          t("Ordena las pistas en la secuencia que quieras usar durante la sesión.")
        }
        eyebrow={t("Crate")}
        title={crate.name}
      />

      {error ? (
        <p className="form-message form-message--error" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="form-message form-message--success" role="status">
          {success}
        </p>
      ) : null}

      <section className="crate-detail-layout">
        <div>
          <div className="organization-section-heading">
            <div>
              <p className="eyebrow">{t("Orden de sesión")}</p>
              <h2>{formatTrackCount(locale, totalMemberships)}</h2>
            </div>
            <Link className="button button--secondary" href="/crates">
              {t("Volver")}
            </Link>
            <DesktopExportLink request={{ crateId: crate.id, crateName: crate.name, trackIds: exportTrackIds }} />
          </div>

          {orderedTracks.length ? (
            <ol className="crate-track-list">
              {orderedTracks.map((track, index) => {
                const globalIndex = rangeFrom + index;
                return (
                <li className="card crate-track" key={track.id}>
                  <span className="crate-track__position">{globalIndex + 1}</span>
                  <div>
                    <Link href={`/library/${track.id}`}>{track.title}</Link>
                    <strong>{track.artist ?? t("Artista desconocido")}</strong>
                    <small>{trackSummary(locale, track)}</small>
                  </div>
                  <div className="crate-track__actions">
                    <form
                      action={moveTrackInCrateAction}
                      data-offline-action="crate-track-move"
                    >
                      <input name="crateId" type="hidden" value={crate.id} />
                      <input name="trackId" type="hidden" value={track.id} />
                      <input name="direction" type="hidden" value="up" />
                      <button
                        aria-label={formatMessage(locale, "Subir {name}", {
                          name: track.title,
                        })}
                        disabled={globalIndex === 0}
                        type="submit"
                      >
                        ↑
                      </button>
                    </form>
                    <form
                      action={moveTrackInCrateAction}
                      data-offline-action="crate-track-move"
                    >
                      <input name="crateId" type="hidden" value={crate.id} />
                      <input name="trackId" type="hidden" value={track.id} />
                      <input name="direction" type="hidden" value="down" />
                      <button
                        aria-label={formatMessage(locale, "Bajar {name}", {
                          name: track.title,
                        })}
                        disabled={globalIndex === totalMemberships - 1}
                        type="submit"
                      >
                        ↓
                      </button>
                    </form>
                    <form
                      action={removeTrackFromCrateAction}
                      data-offline-action="crate-track-remove"
                    >
                      <input name="crateId" type="hidden" value={crate.id} />
                      <input name="trackId" type="hidden" value={track.id} />
                      <button type="submit">{t("Quitar")}</button>
                    </form>
                  </div>
                </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState
              description={t("Busca en tu biblioteca y añade la primera pista.")}
              icon={<Icon name="library" />}
              title={t("Este crate está vacío")}
            />
          )}
          {totalMemberships > CRATE_TRACKS_PER_PAGE ? (
            <nav aria-label={t("Paginación del crate")} className="pagination">
              {requestedPage > 1 ? (
                <Link
                  className="button button--secondary"
                  href={`/crates/${crate.id}?${new URLSearchParams({
                    ...(search ? { q: search } : {}),
                    cratePage: String(requestedPage - 1),
                  })}`}
                >
                  {t("Anterior")}
                </Link>
              ) : (
                <span />
              )}
              <span>
                {requestedPage} / {cratePageCount}
              </span>
              {requestedPage < cratePageCount ? (
                <Link
                  className="button button--secondary"
                  href={`/crates/${crate.id}?${new URLSearchParams({
                    ...(search ? { q: search } : {}),
                    cratePage: String(requestedPage + 1),
                  })}`}
                >
                  {t("Siguiente")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </div>

        <aside className="organization-sidebar">
          <form
            action={updateCrateAction}
            className="card organization-form"
            data-offline-action="crate-update"
          >
            <div>
              <p className="eyebrow">{t("Datos")}</p>
              <h2>{t("Editar crate")}</h2>
            </div>
            <input name="id" type="hidden" value={crate.id} />
            <input name="revision" type="hidden" value={crate.updated_at} />
            <label className="field">
              {t("Nombre")}
              <input
                defaultValue={crate.name}
                maxLength={120}
                name="name"
                required
              />
            </label>
            <label className="field">
              {t("Descripción")}
              <textarea
                defaultValue={crate.description ?? ""}
                maxLength={1000}
                name="description"
                rows={3}
              />
            </label>
            <label className="field">
              {t("Guardar dentro de")}
              <select
                aria-describedby="edit-crate-parent-help"
                defaultValue={crate.parent_id ?? ""}
                name="parentId"
              >
                <option value="">{t("Ninguna")}</option>
                {(allCrates ?? [])
                  .filter((candidate) => candidate.id !== crate.id)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
              </select>
              <small id="edit-crate-parent-help">
                {t("Selecciona otro crate para colocar este crate dentro de él.")}
              </small>
            </label>
            <button className="button button--primary" type="submit">
              {t("Guardar cambios")}
            </button>
          </form>

          <div className="card organization-form">
            <div>
              <p className="eyebrow">{t("Biblioteca")}</p>
              <h2>{t("Añadir pistas")}</h2>
            </div>
            <form className="crate-search" method="get">
              <label className="field">
                {t("Buscar")}
                <input
                  defaultValue={search}
                  maxLength={100}
                  name="q"
                  placeholder={t("Título o artista")}
                  type="search"
                />
              </label>
              <button className="button button--secondary" type="submit">
                {t("Buscar")}
              </button>
            </form>
            {availableTracks.length ? (
              <ul className="available-track-list">
                {availableTracks.map((track) => (
                  <li key={track.id}>
                    <div>
                      <strong>{track.title}</strong>
                      <span>{track.artist ?? t("Artista desconocido")}</span>
                    </div>
                    <form
                      action={addTrackToCrateAction}
                      data-offline-action="crate-track-add"
                    >
                      <input name="crateId" type="hidden" value={crate.id} />
                      <input name="trackId" type="hidden" value={track.id} />
                      <button type="submit">{t("Añadir")}</button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="organization-muted">
                {search
                  ? t("No hay pistas disponibles para esta búsqueda.")
                  : t("No quedan pistas disponibles para añadir.")}
              </p>
            )}
          </div>
        </aside>
      </section>
    </>
  );
}
