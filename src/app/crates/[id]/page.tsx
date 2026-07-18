import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addTrackToCrateAction,
  moveTrackInCrateAction,
  removeTrackFromCrateAction,
  updateCrateAction,
} from "@/app/crates/actions";
import { DeleteCrateForm } from "@/components/organization/delete-organization-forms";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
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

const errorMessages: Record<string, string> = {
  "add-track": "No se pudo añadir la pista.",
  "delete-crate": "No se pudo eliminar el crate.",
  "duplicate-crate": "Ya tienes otro crate con ese nombre.",
  "duplicate-track": "Esa pista ya forma parte del crate.",
  "remove-track": "No se pudo quitar la pista.",
  reorder: "No se pudo cambiar el orden.",
  "save-crate": "No se pudieron guardar los cambios.",
};

function trackSummary(track: Tables<"tracks">) {
  const duration =
    track.duration_seconds === null
      ? "Duración —"
      : formatDuration(Math.round(track.duration_seconds));
  return `${track.bpm ? `${track.bpm} BPM` : "BPM —"} · ${
    track.musical_key ?? "Tonalidad —"
  } · ${duration}`;
}

export const metadata = { title: "Detalle de crate" };

export default async function CrateDetailPage({
  params,
  searchParams,
}: CrateDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const parsedId = organizationIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const supabase = await createClient();
  const [{ data: crate, error: crateError }, { data: memberships, error: memberError }] =
    await Promise.all([
      supabase
        .from("crates")
        .select("*")
        .eq("id", parsedId.data)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("crate_tracks")
        .select("track_id, position")
        .eq("crate_id", parsedId.data)
        .eq("user_id", user.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

  if (crateError || memberError) {
    throw new Error("No se pudo cargar el crate.");
  }
  if (!crate) notFound();

  const membershipRows: CrateMembership[] = memberships ?? [];
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
  const memberSet = new Set(memberIds);
  const candidateRows: Tables<"tracks">[] = candidates ?? [];
  const availableTracks = candidateRows.filter(
    (track: Tables<"tracks">) => !memberSet.has(track.id),
  );

  const error =
    typeof query.error === "string" ? errorMessages[query.error] : null;
  const success =
    query.created === "1"
      ? "El crate se creó correctamente."
      : query.updated === "1"
        ? "Los cambios se guardaron."
        : query.trackAdded === "1"
          ? "La pista se añadió al final del crate."
          : query.trackRemoved === "1"
            ? "La pista se quitó del crate."
            : null;

  return (
    <>
      <PageHeader
        action={<DeleteCrateForm crateId={crate.id} name={crate.name} />}
        description={
          crate.description ||
          "Ordena las pistas en la secuencia que quieras usar durante la sesión."
        }
        eyebrow="Crate"
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
              <p className="eyebrow">Orden de sesión</p>
              <h2>{orderedTracks.length} pistas</h2>
            </div>
            <Link className="button button--secondary" href="/crates">
              Volver
            </Link>
          </div>

          {orderedTracks.length ? (
            <ol className="crate-track-list">
              {orderedTracks.map((track, index) => (
                <li className="card crate-track" key={track.id}>
                  <span className="crate-track__position">{index + 1}</span>
                  <div>
                    <Link href={`/library/${track.id}`}>{track.title}</Link>
                    <strong>{track.artist}</strong>
                    <small>{trackSummary(track)}</small>
                  </div>
                  <div className="crate-track__actions">
                    <form action={moveTrackInCrateAction}>
                      <input name="crateId" type="hidden" value={crate.id} />
                      <input name="trackId" type="hidden" value={track.id} />
                      <input name="direction" type="hidden" value="up" />
                      <button
                        aria-label={`Subir ${track.title}`}
                        disabled={index === 0}
                        type="submit"
                      >
                        ↑
                      </button>
                    </form>
                    <form action={moveTrackInCrateAction}>
                      <input name="crateId" type="hidden" value={crate.id} />
                      <input name="trackId" type="hidden" value={track.id} />
                      <input name="direction" type="hidden" value="down" />
                      <button
                        aria-label={`Bajar ${track.title}`}
                        disabled={index === orderedTracks.length - 1}
                        type="submit"
                      >
                        ↓
                      </button>
                    </form>
                    <form action={removeTrackFromCrateAction}>
                      <input name="crateId" type="hidden" value={crate.id} />
                      <input name="trackId" type="hidden" value={track.id} />
                      <button type="submit">Quitar</button>
                    </form>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              description="Busca en tu biblioteca y añade la primera pista."
              icon={<Icon name="library" />}
              title="Este crate está vacío"
            />
          )}
        </div>

        <aside className="organization-sidebar">
          <form action={updateCrateAction} className="card organization-form">
            <div>
              <p className="eyebrow">Datos</p>
              <h2>Editar crate</h2>
            </div>
            <input name="id" type="hidden" value={crate.id} />
            <label className="field">
              Nombre
              <input
                defaultValue={crate.name}
                maxLength={120}
                name="name"
                required
              />
            </label>
            <label className="field">
              Descripción
              <textarea
                defaultValue={crate.description ?? ""}
                maxLength={1000}
                name="description"
                rows={3}
              />
            </label>
            <button className="button button--primary" type="submit">
              Guardar cambios
            </button>
          </form>

          <div className="card organization-form">
            <div>
              <p className="eyebrow">Biblioteca</p>
              <h2>Añadir pistas</h2>
            </div>
            <form className="crate-search" method="get">
              <label className="field">
                Buscar
                <input
                  defaultValue={search}
                  maxLength={100}
                  name="q"
                  placeholder="Título o artista"
                  type="search"
                />
              </label>
              <button className="button button--secondary" type="submit">
                Buscar
              </button>
            </form>
            {availableTracks.length ? (
              <ul className="available-track-list">
                {availableTracks.map((track) => (
                  <li key={track.id}>
                    <div>
                      <strong>{track.title}</strong>
                      <span>{track.artist}</span>
                    </div>
                    <form action={addTrackToCrateAction}>
                      <input name="crateId" type="hidden" value={crate.id} />
                      <input name="trackId" type="hidden" value={track.id} />
                      <button type="submit">Añadir</button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="organization-muted">
                {search
                  ? "No hay pistas disponibles para esta búsqueda."
                  : "No quedan pistas disponibles para añadir."}
              </p>
            )}
          </div>
        </aside>
      </section>
    </>
  );
}
