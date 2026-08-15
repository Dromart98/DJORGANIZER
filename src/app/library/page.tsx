import Link from "next/link";
import { redirect } from "next/navigation";
import { ArchiveHistory } from "@/components/library/archive-history";
import { BulkEditHistory } from "@/components/library/bulk-edit-history";
import { CreateCrateFromFilters } from "@/components/library/create-crate-from-filters";
import { TagHistory } from "@/components/library/tag-history";
import { TrackFilters } from "@/components/library/track-filters";
import { TrackTable } from "@/components/library/track-table";
import { Icon } from "@/components/layout/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { formatMessage, formatTrackCount, translate } from "@/lib/i18n/functional";
import { getMessages } from "@/lib/i18n/i18n";
import { getCurrentLocale } from "@/lib/i18n/server";
import { listTrackArchiveHistory } from "@/lib/library/archive-history";
import { listTrackTagHistory } from "@/lib/library/tag-history";
import { listBulkTrackEditHistory } from "@/lib/library/track-history";
import {
  buildLibraryHref,
  parseTrackQuery,
  queryToSearchParams,
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
  const [page, tags, bulkEditHistory, tagHistory, archiveHistory] = await Promise.all([
    listTracks(supabase, user.id, query),
    listUserTags(supabase, user.id),
    listBulkTrackEditHistory(supabase, 10),
    listTrackTagHistory(supabase, 10),
    listTrackArchiveHistory(supabase, 10),
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
    query.status !== "active" ||
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
  const filteredSearchParams = queryToSearchParams({
    ...query,
    page: 1,
  }).toString();
  const returnTo = buildLibraryHref(query, {});

  return (
    <>
      <PageHeader
        action={
          <div className="empty-state__actions">
            <Link className="button button--secondary" href="/library/health">
              {locale === "en" ? "Library health" : "Salud de la biblioteca"}
            </Link>
            <Link className="button button--primary" href="/library/new">
              {t("Añadir canción")}
            </Link>
          </div>
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
      {rawSearchParams.tagUndone === "1" ? (
        <p className="form-message form-message--success" role="status">
          {locale === "en"
            ? "The tag change was undone."
            : "El cambio de etiqueta se deshizo correctamente."}
        </p>
      ) : null}
      {rawSearchParams.tagUndoError === "1" ? (
        <p className="form-message form-message--error" role="alert">
          {rawSearchParams.tagUndoReason === "changed"
            ? locale === "en"
              ? "This tag change cannot be undone because the tag or affected tracks changed afterwards."
              : "No se puede deshacer este cambio de etiqueta porque la etiqueta o las pistas afectadas cambiaron después."
            : locale === "en"
              ? "The tag change could not be undone."
              : "No se pudo deshacer el cambio de etiqueta."}
        </p>
      ) : null}
      {rawSearchParams.tagError === "1" ? (
        <p className="form-message form-message--error" role="alert">
          {t("No se pudo actualizar la etiqueta de la selección.")}
        </p>
      ) : null}
      {rawSearchParams.archiveUndone === "1" ? (
        <p className="form-message form-message--success" role="status">
          {locale === "en"
            ? "The archive change was undone."
            : "El cambio de archivado se deshizo correctamente."}
        </p>
      ) : null}
      {rawSearchParams.archiveUndoError === "1" ? (
        <p className="form-message form-message--error" role="alert">
          {rawSearchParams.archiveUndoReason === "changed"
            ? locale === "en"
              ? "This archive change cannot be undone because the track archive state changed afterwards."
              : "No se puede deshacer este cambio porque el estado de archivado de la pista cambió después."
            : locale === "en"
              ? "The archive change could not be undone."
              : "No se pudo deshacer el cambio de archivado."}
        </p>
      ) : null}
      {rawSearchParams.bulkUpdated === "1" ? (
        <p className="form-message form-message--success" role="status">
          {t("Los metadatos de la selección se actualizaron correctamente.")}
        </p>
      ) : null}
      {rawSearchParams.bulkUndone === "1" ? (
        <p className="form-message form-message--success" role="status">
          {locale === "en"
            ? "The bulk edit was undone."
            : "La edición masiva se deshizo correctamente."}
        </p>
      ) : null}
      {rawSearchParams.bulkUndoError === "1" ? (
        <p className="form-message form-message--error" role="alert">
          {rawSearchParams.bulkUndoReason === "changed"
            ? locale === "en"
              ? "This bulk edit cannot be undone because at least one track changed afterwards."
              : "No se puede deshacer esta edición masiva porque al menos una pista cambió después."
            : locale === "en"
              ? "The bulk edit could not be undone."
              : "No se pudo deshacer la edición masiva."}
        </p>
      ) : null}
      {rawSearchParams.bulkError === "1" ? (
        <p className="form-message form-message--error" role="alert">
          {t("No se pudo aplicar la edición. Revisa el valor introducido.")}
        </p>
      ) : null}

      <BulkEditHistory
        batches={bulkEditHistory}
        locale={locale}
        returnTo={returnTo}
      />
      <TagHistory entries={tagHistory} locale={locale} returnTo={returnTo} />
      <ArchiveHistory
        entries={archiveHistory}
        locale={locale}
        returnTo={returnTo}
      />

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
        {hasFilters && query.status === "active" && page.count > 0 ? (
          <CreateCrateFromFilters
            filteredCount={page.count}
            searchParams={filteredSearchParams}
          />
        ) : null}
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
