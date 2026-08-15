import Link from "next/link";
import { redirect } from "next/navigation";
import { MetadataCleanupReview } from "@/components/library/metadata-cleanup-review";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { getCurrentLocale } from "@/lib/i18n/server";
import { buildMetadataCleanupProposals } from "@/lib/library/metadata-cleanup";
import { createClient } from "@/lib/supabase/server";
import styles from "./metadata-cleanup.module.css";

const TRACKS_PER_PAGE = 20;

type CleanupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInteger(value: string | string[] | undefined, fallback = 1) {
  const parsed = Number(scalar(value));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function statusInteger(value: string | string[] | undefined) {
  const parsed = Number(scalar(value));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return {
    title: locale === "en" ? "Guided metadata cleanup" : "Limpieza guiada de metadatos",
  };
}

export default async function MetadataCleanupPage({ searchParams }: CleanupPageProps) {
  const [user, locale, params] = await Promise.all([
    requireUser(),
    getCurrentLocale(),
    searchParams,
  ]);
  const en = locale === "en";
  const page = positiveInteger(params.page);
  const applied = statusInteger(params.applied);
  const skipped = statusInteger(params.skipped);
  const failed = statusInteger(params.failed);
  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("tracks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) throw new Error("No se pudo preparar la limpieza de metadatos.");

  const totalTracks = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalTracks / TRACKS_PER_PAGE));
  if (page > pageCount) redirect(`/library/health/cleanup?page=${pageCount}`);

  const from = (page - 1) * TRACKS_PER_PAGE;
  const { data, error } = await supabase
    .from("tracks")
    .select("id, title, artist, album, genre, subgenre")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + TRACKS_PER_PAGE - 1);
  if (error) throw new Error("No se pudieron preparar las propuestas de limpieza.");

  const proposals = buildMetadataCleanupProposals(data ?? []);

  return (
    <>
      <PageHeader
        action={
          <div className={styles.actions}>
            <Link className="button button--secondary" href="/library/health">
              {en ? "Library health" : "Salud de la biblioteca"}
            </Link>
            <Link className="button button--secondary" href="/library">
              {en ? "Library" : "Biblioteca"}
            </Link>
          </div>
        }
        description={
          en
            ? "Review deterministic cleanup suggestions before changing stored metadata. Nothing is accepted automatically."
            : "Revisa propuestas deterministas de limpieza antes de cambiar los metadatos guardados. Nada se acepta automáticamente."
        }
        eyebrow={en ? "Maintenance" : "Mantenimiento"}
        title={en ? "Guided metadata cleanup" : "Limpieza guiada de metadatos"}
      />

      <div className={styles.pageIntro}>
        <div className={`card ${styles.notice}`}>
          <strong>
            {en ? "Safe review flow" : "Flujo de revisión seguro"}
          </strong>
          <span>
            {en
              ? "Suggestions normalize whitespace, residual URLs, short track-number prefixes, separators, uniform capitalization and known genre aliases. Mixed-case values and compact names such as AC/DC are left alone unless another explicit rule applies."
              : "Las propuestas normalizan espacios, URLs residuales, prefijos numéricos cortos, separadores, uso uniforme de mayúsculas y aliases conocidos de género. Los valores con mayúsculas intencionadas y nombres compactos como AC/DC se dejan intactos salvo que aplique otra regla explícita."}
          </span>
          <span>
            {en
              ? "Applying a proposal updates DJOrganizer only. Writing metadata into audio files remains a separate, explicit desktop operation with preview and backup."
              : "Aplicar una propuesta actualiza solo DJOrganizer. Escribir metadatos dentro de los archivos de audio sigue siendo una operación de escritorio independiente y explícita, con previsualización y copia de seguridad."}
          </span>
        </div>

        {(applied || skipped || failed) ? (
          <p
            className={failed ? "form-message form-message--error" : "form-message form-message--success"}
            role={failed ? "alert" : "status"}
          >
            {en
              ? `${applied} changes applied · ${skipped} skipped because they were stale or invalid · ${failed} failed.`
              : `${applied} cambios aplicados · ${skipped} omitidos por estar desactualizados o no ser válidos · ${failed} fallidos.`}
          </p>
        ) : null}

        <p className={styles.pageMeta}>
          {en
            ? `Track batch ${page} of ${pageCount} · ${totalTracks.toLocaleString(locale)} tracks in the library.`
            : `Lote de pistas ${page} de ${pageCount} · ${totalTracks.toLocaleString(locale)} pistas en la biblioteca.`}
        </p>
      </div>

      {proposals.length ? (
        <MetadataCleanupReview locale={locale} page={page} proposals={proposals} />
      ) : (
        <div className={`card ${styles.empty}`}>
          {en
            ? "No cleanup suggestions were found in this batch."
            : "No se encontraron propuestas de limpieza en este lote."}
        </div>
      )}

      {pageCount > 1 ? (
        <nav className={styles.pagination} aria-label={en ? "Cleanup pages" : "Páginas de limpieza"}>
          {page > 1 ? (
            <Link className="button button--secondary" href={`/library/health/cleanup?page=${page - 1}`}>
              {en ? "Previous batch" : "Lote anterior"}
            </Link>
          ) : (
            <span />
          )}
          <span>{page} / {pageCount}</span>
          {page < pageCount ? (
            <Link className="button button--secondary" href={`/library/health/cleanup?page=${page + 1}`}>
              {en ? "Next batch" : "Lote siguiente"}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
