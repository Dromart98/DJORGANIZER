import Link from "next/link";
import { createCrateAction, createTagAction } from "@/app/crates/actions";
import { DeleteTagForm } from "@/components/organization/delete-organization-forms";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { getMessages } from "@/lib/i18n/i18n";
import { getCurrentLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

type CratesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const errorMessages: Record<string, string> = {
  "delete-tag": "No se pudo eliminar la etiqueta.",
  "duplicate-crate": "Ya tienes un crate con ese nombre.",
  "duplicate-tag": "Ya tienes una etiqueta con ese nombre.",
  "invalid-crate": "Revisa el nombre y la descripción del crate.",
  "invalid-tag": "La etiqueta debe tener entre 1 y 80 caracteres.",
  "save-crate": "No se pudo guardar el crate.",
  "save-tag": "No se pudo guardar la etiqueta.",
};

export const metadata = { title: "Crates y etiquetas" };

export default async function CratesPage({ searchParams }: CratesPageProps) {
  const [user, query, locale] = await Promise.all([
    requireUser(),
    searchParams,
    getCurrentLocale(),
  ]);
  const supabase = await createClient();
  const [
    { data: crates, error: cratesError },
    { data: crateTracks, error: crateTracksError },
    { data: tags, error: tagsError },
    { data: trackTags, error: trackTagsError },
    { count: trackCount, error: trackCountError },
  ] = await Promise.all([
    supabase
      .from("crates")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("crate_tracks")
      .select("crate_id")
      .eq("user_id", user.id),
    supabase
      .from("tags")
      .select("*")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
    supabase.from("track_tags").select("tag_id").eq("user_id", user.id),
    supabase
      .from("tracks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  if (
    cratesError ||
    crateTracksError ||
    tagsError ||
    trackTagsError ||
    trackCountError
  ) {
    throw new Error("No se pudo cargar la organización de tu biblioteca.");
  }

  const crateRows = crates ?? [];
  const crateTrackRows = crateTracks ?? [];
  const tagRows = tags ?? [];
  const trackTagRows = trackTags ?? [];
  const hasTracks = (trackCount ?? 0) > 0;
  const emptyCopy = getMessages(locale).cratesEmpty;
  const crateCounts = new Map<string, number>();
  for (const membership of crateTrackRows) {
    crateCounts.set(
      membership.crate_id,
      (crateCounts.get(membership.crate_id) ?? 0) + 1,
    );
  }
  const tagCounts = new Map<string, number>();
  for (const membership of trackTagRows) {
    tagCounts.set(
      membership.tag_id,
      (tagCounts.get(membership.tag_id) ?? 0) + 1,
    );
  }

  const error =
    typeof query.error === "string" ? errorMessages[query.error] : null;
  const success =
    query.crateDeleted === "1"
      ? "El crate se eliminó sin borrar sus canciones."
      : query.tagCreated === "1"
        ? "La etiqueta se creó correctamente."
        : query.tagDeleted === "1"
          ? "La etiqueta se eliminó de la biblioteca."
          : null;

  return (
    <>
      <PageHeader
        description="Prepara sesiones con orden propio y clasifica canciones con etiquetas reutilizables."
        eyebrow="Organización"
        title="Crates y etiquetas"
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

      <section className="organization-layout">
        <div>
          <div className="organization-section-heading">
            <div>
              <p className="eyebrow">Sesiones</p>
              <h2>Tus crates</h2>
            </div>
            <span>{crateRows.length}</span>
          </div>

          {crateRows.length ? (
            <div className="crate-grid">
              {crateRows.map((crate: Tables<"crates">) => {
                const count = crateCounts.get(crate.id) ?? 0;
                return (
                  <Link
                    className="card crate-card"
                    href={`/crates/${crate.id}`}
                    key={crate.id}
                  >
                    <div className="crate-card__icon">
                      <Icon name="crates" />
                    </div>
                    <div>
                      <strong>{crate.name}</strong>
                      {crate.parent_id ? (
                        <small>
                          Dentro de{" "}
                          {crateRows.find((item) => item.id === crate.parent_id)
                            ?.name ?? "otro crate"}
                        </small>
                      ) : null}
                      <p>
                        {crate.description || "Sin descripción"}
                      </p>
                    </div>
                    <span>
                      {count} {count === 1 ? "pista" : "pistas"}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState
              action={
                hasTracks ? (
                  <Link
                    className="button button--primary"
                    href="#create-crate"
                  >
                    {emptyCopy.createAction}
                  </Link>
                ) : (
                  <div className="empty-state__actions">
                    <Link className="button button--primary" href="/import">
                      {emptyCopy.primaryAction}
                    </Link>
                    <Link
                      className="button button--secondary"
                      href="/library/new"
                    >
                      {emptyCopy.manualAction}
                    </Link>
                  </div>
                )
              }
              description={
                hasTracks
                  ? emptyCopy.createDescription
                  : emptyCopy.noTracksDescription
              }
              icon={<Icon name="crates" />}
              title={
                hasTracks ? emptyCopy.createTitle : emptyCopy.noTracksTitle
              }
            />
          )}
        </div>

        <aside className="organization-sidebar">
          {hasTracks ? (
            <form
              action={createCrateAction}
              className="card organization-form"
              data-offline-action="crate-create"
              id="create-crate"
            >
              <div>
                <p className="eyebrow">Nuevo</p>
                <h2>Crear crate</h2>
              </div>
              <label className="field">
                Nombre
                <input maxLength={120} name="name" required />
              </label>
              <label className="field">
                Descripción
                <textarea maxLength={1000} name="description" rows={3} />
              </label>
              <label className="field">
                Carpeta superior
                <select defaultValue="" name="parentId">
                  <option value="">Nivel principal</option>
                  {crateRows.map((crate) => (
                    <option key={crate.id} value={crate.id}>
                      {crate.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button button--primary" type="submit">
                Crear crate
              </button>
            </form>
          ) : (
            <Card className="organization-form organization-guidance">
              <div>
                <p className="eyebrow">Crates</p>
                <h2>{emptyCopy.sidebarTitle}</h2>
              </div>
              <p className="organization-muted">
                {emptyCopy.sidebarDescription}
              </p>
              <Link className="button button--primary" href="/import">
                {emptyCopy.primaryAction}
              </Link>
            </Card>
          )}

          <div className="card organization-form">
            <div>
              <p className="eyebrow">Clasificación</p>
              <h2>Etiquetas</h2>
            </div>
            <form
              action={createTagAction}
              className="tag-create-form"
              data-offline-action="tag-create"
            >
              <label className="field">
                Nombre
                <input maxLength={80} name="name" required />
              </label>
              <button className="button button--secondary" type="submit">
                Añadir
              </button>
            </form>
            {tagRows.length ? (
              <ul className="tag-list">
                {tagRows.map((tag: Tables<"tags">) => (
                  <li key={tag.id}>
                    <span>{tag.name}</span>
                    <small>{tagCounts.get(tag.id) ?? 0} pistas</small>
                    <DeleteTagForm
                      name={tag.name}
                      revision={tag.updated_at}
                      tagId={tag.id}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="organization-muted">
                Aún no has creado etiquetas.
              </p>
            )}
          </div>
        </aside>
      </section>
    </>
  );
}
