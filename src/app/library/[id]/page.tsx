import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteTrackForm } from "@/components/library/delete-track-form";
import { TrackEditHistory } from "@/components/library/track-edit-history";
import { TrackForm } from "@/components/library/track-form";
import { TrackTags } from "@/components/library/track-tags";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import {
  formatMessage,
  formatSuggestionCount,
  translate,
  translateKnown,
} from "@/lib/i18n/functional";
import type { Locale } from "@/lib/i18n/i18n";
import { getCurrentLocale } from "@/lib/i18n/server";
import { listTrackEditHistory } from "@/lib/library/track-history";
import {
  getTrack,
  listCompatibleTracks,
  listTrackTags,
  listUserTags,
} from "@/lib/library/track-repository";
import { trackIdSchema } from "@/lib/library/track-schema";
import { listManualCratesForTrack } from "@/lib/organization/track-crates";
import { createClient } from "@/lib/supabase/server";

type TrackDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return { title: translate(locale, "Detalle de canción") };
}

function sourceLabel(locale: Locale, source: string | null) {
  const label = (
    {
      automatic: "Análisis automático",
      manual: "Revisado manualmente",
      metadata: "Metadatos del archivo",
      unknown: "Procedencia anterior",
    }[source ?? ""] ?? "Sin analizar"
  );
  return translate(locale, label as Parameters<typeof translate>[1]);
}

export default async function TrackDetailPage({
  params,
  searchParams,
}: TrackDetailPageProps) {
  const [user, locale] = await Promise.all([requireUser(), getCurrentLocale()]);
  const t = (message: Parameters<typeof translate>[1]) =>
    translate(locale, message);
  const { id } = await params;
  const parsedId = trackIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createClient();
  const track = await getTrack(supabase, user.id, parsedId.data);
  if (!track) notFound();
  const [tags, compatibleTracks, trackCrates, editHistory] = await Promise.all([
    listUserTags(supabase, user.id),
    listCompatibleTracks(supabase, user.id, track),
    listManualCratesForTrack(supabase, user.id, track.id),
    listTrackEditHistory(supabase, track.id),
  ]);
  const trackTags = await listTrackTags(supabase, user.id, [track.id]);

  const query = await searchParams;

  return (
    <>
      <PageHeader
        action={
          <DeleteTrackForm
            revision={track.updated_at}
            title={track.title}
            trackId={track.id}
          />
        }
        description={formatMessage(locale, "Añadida el {date}.", {
          date: new Intl.DateTimeFormat(locale, {
            dateStyle: "long",
          }).format(new Date(track.created_at)),
        })}
        eyebrow={t("Detalle y edición")}
        title={track.title}
      />
      {query.updated === "1" ? (
        <p className="form-message form-message--success" role="status">
          {t("Los cambios se guardaron correctamente.")}
        </p>
      ) : null}
      {query.undone === "1" ? (
        <p className="form-message form-message--success" role="status">
          {locale === "en"
            ? "The edit was undone."
            : "La edición se deshizo correctamente."}
        </p>
      ) : null}
      {query.undoError === "changed" ? (
        <p className="form-message form-message--error" role="alert">
          {locale === "en"
            ? "This edit cannot be undone because the track changed afterwards."
            : "No se puede deshacer esta edición porque la pista cambió después."}
        </p>
      ) : null}
      {query.undoError === "failed" ? (
        <p className="form-message form-message--error" role="alert">
          {locale === "en"
            ? "The edit could not be undone."
            : "No se pudo deshacer la edición."}
        </p>
      ) : null}
      {query.tagged === "1" ? (
        <p className="form-message form-message--success" role="status">
          {t("La etiqueta se asignó a la selección.")}
        </p>
      ) : null}
      {query.untagged === "1" ? (
        <p className="form-message form-message--success" role="status">
          {t("La etiqueta se quitó de la selección.")}
        </p>
      ) : null}
      {query.tagError === "1" ? (
        <p className="form-message form-message--error" role="alert">
          {t("No se pudo actualizar la etiqueta de la selección.")}
        </p>
      ) : null}
      <section
        aria-labelledby="analysis-provenance-title"
        className="card analysis-provenance"
      >
        <div>
          <p className="eyebrow">{t("Análisis explicable")}</p>
          <h2 id="analysis-provenance-title">{t("Procedencia y confianza")}</h2>
        </div>
        <dl>
          <div>
            <dt>BPM</dt>
            <dd>
              <strong>{sourceLabel(locale, track.bpm_source)}</strong>
              {track.bpm_confidence === null
                ? null
                : ` · ${Math.round(track.bpm_confidence * 100)}%`}
              <small>
                {(track.bpm_explanation
                  ? translateKnown(locale, track.bpm_explanation)
                  : null) ??
                  t("No hay una explicación guardada para este valor.")}
              </small>
            </dd>
          </div>
          <div>
            <dt>{t("Tonalidad")}</dt>
            <dd>
              <strong>{sourceLabel(locale, track.key_source)}</strong>
              {track.key_confidence === null
                ? null
                : ` · ${Math.round(track.key_confidence * 100)}%`}
              <small>
                {(track.key_explanation
                  ? translateKnown(locale, track.key_explanation)
                  : null) ??
                  t("No hay una explicación guardada para este valor.")}
              </small>
            </dd>
          </div>
        </dl>
      </section>
      <TrackForm key={track.updated_at} mode="update" track={track} />
      <TrackEditHistory entries={editHistory} locale={locale} trackId={track.id} />
      <TrackTags
        assignedTags={trackTags[track.id] ?? []}
        availableTags={tags}
        trackId={track.id}
        trackTitle={track.title}
      />
      <section aria-labelledby="track-crates-title" className="card">
        <div className="organization-section-heading">
          <div>
            <p className="eyebrow">
              {locale === "en" ? "Organization" : "Organización"}
            </p>
            <h2 id="track-crates-title">Crates</h2>
          </div>
          <span>{trackCrates.length}</span>
        </div>
        {trackCrates.length ? (
          <ul className="tag-list">
            {trackCrates.map((crate) => (
              <li key={crate.id}>
                <Link className="table-action" href={`/crates/${crate.id}`}>
                  {crate.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="organization-muted">
            {locale === "en"
              ? "This track is not in any manual crate."
              : "Esta pista no está en ningún crate manual."}
          </p>
        )}
      </section>
      <section className="recommendations">
        <div className="organization-section-heading">
          <div>
            <p className="eyebrow">{t("Mezcla armónica")}</p>
            <h2>{t("Pistas compatibles")}</h2>
          </div>
          <span>{formatSuggestionCount(locale, compatibleTracks.length)}</span>
        </div>
        {track.camelot_key ? (
          compatibleTracks.length ? (
            <div className="recommendation-grid">
              {compatibleTracks.map((candidate) => (
                <Link
                  className="card recommendation-card"
                  href={`/library/${candidate.id}`}
                  key={candidate.id}
                >
                  <strong>{candidate.title}</strong>
                  <span>{candidate.artist ?? t("Artista desconocido")}</span>
                  <small>
                    {candidate.camelot_key} · {candidate.bpm ?? "—"} BPM
                  </small>
                  <em>{candidate.compatibility_reason}</em>
                </Link>
              ))}
            </div>
          ) : (
            <p className="organization-muted">
              {t("No hay pistas dentro del rango armónico y de BPM recomendado.")}
            </p>
          )
        ) : (
          <p className="organization-muted">
            {t("Añade una tonalidad para obtener recomendaciones armónicas.")}
          </p>
        )}
      </section>
    </>
  );
}
