import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";
import { TrackFilters } from "@/components/library/track-filters";
import { TrackTable } from "@/components/library/track-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
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
  const user = await requireUser();
  const rawSearchParams = await searchParams;
  const query = parseTrackQuery(rawSearchParams);
  const supabase = await createClient();
  const page = await listTracks(supabase, user.id, query);
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
          <TrackTable query={query} tracks={page.tracks} />
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
              <Link className="button button--primary" href="/library/new">
                Añadir la primera canción
              </Link>
            )
          }
          description={
            hasFilters
              ? "Prueba con otros términos o elimina alguno de los filtros."
              : "Añade manualmente una canción para empezar tu biblioteca privada."
          }
          icon={<Icon name="library" />}
          title={
            hasFilters
              ? "No hay resultados para estos filtros"
              : "Tu biblioteca está vacía"
          }
        />
      )}
    </>
  );
}
