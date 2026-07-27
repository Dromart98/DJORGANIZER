import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";
import { TrackFilters } from "@/components/library/track-filters";
import { TrackTable } from "@/components/library/track-table";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { formatMessage, formatTrackCount, translate } from "@/lib/i18n/functional";
import { getMessages } from "@/lib/i18n/i18n";
import { getCurrentLocale } from "@/lib/i18n/server";
import {
  buildLibraryHref,
  parseTrackQuery,
} from "@/lib/library/track-query";
import { listTracks, listTrackTags, listUserTags } from "@/lib/library/track-repository";
import { createClient } from "@/lib/supabase/server";

type LibraryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return { title: translate(locale, "Biblioteca") };
}

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
  const t = (message: Parameters<typeof translate>[1]) =>
    translate(locale, message);
  const supabase = await createClient();
  const [page, tags] = await Promise.all([
    listTracks(supabase, user.id, query),
    listUserTags(supabase, user.id),
  ]);
  const trackTags = await listTrackTags(
    supabase,
    user.id,
    page.tracks.map((track) => track.id),
  );
  if (page.count > 0 && query.page > page.pageCount) {
    redirect(buildLibraryHref(query, { page: page.pageCount }));
  }
  const hasFilters = Boolean(
    query.q ||
      query.genre ||
      query.subgenre ||
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
            {t("Añadir canción")}
          </Link>
        }
        description={t("Busca, filtra y edita tus pistas.")}
        eyebrow={t("Colección")}
        title={t("Biblioteca")}
      />

      {rawSearchParams.deleted === "1" ? (
        <p className="form-message form-message--success" role="status">
          {t("La selección se eliminó correctamente.")}
        </p>
      ) : null}
      {rawSearchParams.tagged === "1" ? (
        <p className="form-message form-message--success" role="status">
          {t("La etiqueta se asignó a la selección.")}
        </p>
      ) : null}
      {rawSearchParams.untagged === "1" ? (
        <p className="form-message form-message--success" role="status">
          {t("La etiqueta se quitó de la selección.")}
        </p>
      ) : null}
      {rawSearchParams.tagError === "1" ? (
        <p className="form-message form-message--error" role="alert">
          {t("No se pudo actualizar la etiqueta de la selección.")}
        </p>
      ) : null}
      {rawSearchParams.bulkUpdated === "1" ? (
        <p className="form-message form-message--success" role="status">
          {t("Los metadatos de la selección se actualizaron correctamente.")}
        </p>
      ) : null}
      {rawSearchParams.bulkError === "1" ? (
        <p className="form-message form-message--error" role="alert">
          {t("No se pudo aplicar la edición. Revisa el valor introducido.")}
        </p>
      ) : null}

      <TrackFilters query={query} />

      <div className="library-toolbar">
        <div>
          <span className="status-dot" />
          {formatTrackCount(locale, page.count)}
        </div>
        <p>
          {formatMessage(locale, "Página {page} de {pages}", {
            page: page.page,
            pages: page.pageCount,
          })}
        </p>
      </div>

      {page.tracks.length > 0 ? (
        <>
          <TrackTable query={query} tags={tags} trackTags={trackTags} tracks={page.tracks} />
          <nav aria-label={t("Paginación de biblioteca")} className="pagination">
            {page.page > 1 ? (
              <Link
                className="button button--secondary"
                href={buildLibraryHref(query, { page: page.page - 1 })}
              >
                {t("Anterior")}
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
                {t("Siguiente")}
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
                {t("Limpiar filtros")}
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
              ? t("Prueba con otros términos o elimina alguno de los filtros.")
              : emptyCopy.description
          }
          icon={<Icon name="library" />}
          title={
            hasFilters
              ? t("No hay resultados para estos filtros")
              : emptyCopy.title
          }
        />
      )}
    </>
  );
}
