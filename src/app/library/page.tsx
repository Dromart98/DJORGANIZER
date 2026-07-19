import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";
import { TrackFilters } from "@/components/library/track-filters";
import { TrackTable } from "@/components/library/track-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { getMessages } from "@/lib/i18n/i18n";
import { getCurrentLocale } from "@/lib/i18n/server";
import {
  buildLibraryHref,
  parseTrackQuery,
} from "@/lib/library/track-query";
import { listTracks } from "@/lib/library/track-repository";
import { createClient } from "@/lib/supabase/server";

type LibraryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata = { title: "Biblioteca" };

export default async function LibraryPage({
  searchParams,
}: LibraryPageProps) {
  const [user, rawSearchParams, locale] = await Promise.all([
    requireUser(),
    searchParams,
    getCurrentLocale(),
  ]);
  const query = parseTrackQuery(rawSearchParams);
  const emptyCopy = getMessages(locale).libraryEmpty;
  const supabase = await createClient();
  const [page, { data: tags, error: tagsError }] = await Promise.all([
    listTracks(supabase, user.id, query),
    supabase
      .from("tags")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name", { ascending: true }),
  ]);
  if (tagsError) throw new Error("No se pudieron cargar las etiquetas.");
  if (page.count > 0 && query.page > page.pageCount) {
    redirect(buildLibraryHref(query, { page: page.pageCount }));
  }
  const hasFilters = Boolean(
    query.q ||
      query.genre ||
      query.bpmMin !== undefined ||
      query.bpmMax !== undefined ||
      query.key ||
      query.camelot ||
      query.energyMin !== undefined ||
      query.energyMax !== undefined ||
      query.rating !== undefined,
  );

  return (
    <>
      <PageHeader
        action={
          <Link className="button button--primary" href="/library/new">
            Añadir canción
          </Link>
        }
        description="Busca, filtra y edita tu colección privada guardada en Supabase."
        eyebrow="Colección"
        title="Biblioteca"
      />

      {rawSearchParams.deleted === "1" ? (
        <p className="form-message form-message--success" role="status">
          La selección se eliminó correctamente.
        </p>
      ) : null}
      {rawSearchParams.tagged === "1" ? (
        <p className="form-message form-message--success" role="status">
          La etiqueta se asignó a la selección.
        </p>
      ) : null}
      {rawSearchParams.untagged === "1" ? (
        <p className="form-message form-message--success" role="status">
          La etiqueta se quitó de la selección.
        </p>
      ) : null}
      {rawSearchParams.tagError === "1" ? (
        <p className="form-message form-message--error" role="alert">
          No se pudo actualizar la etiqueta de la selección.
        </p>
      ) : null}
      {rawSearchParams.bulkUpdated === "1" ? (
        <p className="form-message form-message--success" role="status">
          Los metadatos de la selección se actualizaron correctamente.
        </p>
      ) : null}
      {rawSearchParams.bulkError === "1" ? (
        <p className="form-message form-message--error" role="alert">
          No se pudo aplicar la edición. Revisa el valor introducido.
        </p>
      ) : null}

      <TrackFilters query={query} />

      <div className="library-toolbar">
        <div>
          <span className="status-dot" />
          {page.count} {page.count === 1 ? "canción" : "canciones"}
        </div>
        <p>
          Página {page.page} de {page.pageCount}
        </p>
      </div>

      {page.tracks.length > 0 ? (
        <>
          <TrackTable query={query} tags={tags} tracks={page.tracks} />
          <nav aria-label="Paginación de biblioteca" className="pagination">
            {page.page > 1 ? (
              <Link
                className="button button--secondary"
                href={buildLibraryHref(query, { page: page.page - 1 })}
              >
                Anterior
              </Link>
            ) : (
              <span />
            )}
            <span>
              {page.page} / {page.pageCount}
            </span>
            {page.page < page.pageCount ? (
              <Link
                className="button button--secondary"
                href={buildLibraryHref(query, { page: page.page + 1 })}
              >
                Siguiente
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      ) : (
        <EmptyState
          action={
            hasFilters ? (
              <Link className="button button--secondary" href="/library">
                Limpiar filtros
              </Link>
            ) : (
              <div className="empty-state__actions">
                <Link className="button button--primary" href="/import">
                  {emptyCopy.primaryAction}
                </Link>
                <Link className="button button--secondary" href="/library/new">
                  {emptyCopy.manualAction}
                </Link>
              </div>
            )
          }
          description={
            hasFilters
              ? "Prueba con otros términos o elimina alguno de los filtros."
              : emptyCopy.description
          }
          icon={<Icon name="library" />}
          title={
            hasFilters
              ? "No hay resultados para estos filtros"
              : emptyCopy.title
          }
        />
      )}
    </>
  );
}
