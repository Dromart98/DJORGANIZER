import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteTrackForm } from "@/components/library/delete-track-form";
import { TrackForm } from "@/components/library/track-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import {
  getTrack,
  listCompatibleTracks,
} from "@/lib/library/track-repository";
import { trackIdSchema } from "@/lib/library/track-schema";
import { createClient } from "@/lib/supabase/server";

type TrackDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata = { title: "Detalle de canción" };

function sourceLabel(source: string | null) {
  return (
    {
      local: "Análisis local",
      manual: "Revisado manualmente",
      metadata: "Metadatos del archivo",
      unknown: "Procedencia anterior",
    }[source ?? ""] ?? "Sin analizar"
  );
}

export default async function TrackDetailPage({
  params,
  searchParams,
}: TrackDetailPageProps) {
  const user = await requireUser();
  const { id } = await params;
  const parsedId = trackIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createClient();
  const track = await getTrack(supabase, user.id, parsedId.data);
  if (!track) notFound();
  const compatibleTracks = await listCompatibleTracks(
    supabase,
    user.id,
    track,
  );

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
        description={`Añadida el ${new Intl.DateTimeFormat("es-ES", {
          dateStyle: "long",
        }).format(new Date(track.created_at))}.`}
        eyebrow="Detalle y edición"
        title={track.title}
      />
      {query.updated === "1" ? (
        <p className="form-message form-message--success" role="status">
          Los cambios se guardaron correctamente.
        </p>
      ) : null}
      <section
        aria-labelledby="analysis-provenance-title"
        className="card analysis-provenance"
      >
        <div>
          <p className="eyebrow">Análisis explicable</p>
          <h2 id="analysis-provenance-title">Procedencia y confianza</h2>
        </div>
        <dl>
          <div>
            <dt>BPM</dt>
            <dd>
              <strong>{sourceLabel(track.bpm_source)}</strong>
              {track.bpm_confidence === null
                ? null
                : ` · ${Math.round(track.bpm_confidence * 100)}%`}
              <small>
                {track.bpm_explanation ??
                  "No hay una explicación guardada para este valor."}
              </small>
            </dd>
          </div>
          <div>
            <dt>Tonalidad</dt>
            <dd>
              <strong>{sourceLabel(track.key_source)}</strong>
              {track.key_confidence === null
                ? null
                : ` · ${Math.round(track.key_confidence * 100)}%`}
              <small>
                {track.key_explanation ??
                  "No hay una explicación guardada para este valor."}
              </small>
            </dd>
          </div>
        </dl>
      </section>
      <TrackForm mode="update" track={track} />
      <section className="recommendations">
        <div className="organization-section-heading">
          <div>
            <p className="eyebrow">Mezcla armónica</p>
            <h2>Pistas compatibles</h2>
          </div>
          <span>{compatibleTracks.length} sugerencias</span>
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
                  <span>{candidate.artist ?? "Artista desconocido"}</span>
                  <small>
                    {candidate.camelot_key} · {candidate.bpm ?? "—"} BPM
                  </small>
                  <em>{candidate.compatibility_reason}</em>
                </Link>
              ))}
            </div>
          ) : (
            <p className="organization-muted">
              No hay pistas dentro del rango armónico y de BPM recomendado.
            </p>
          )
        ) : (
          <p className="organization-muted">
            Añade una tonalidad para obtener recomendaciones armónicas.
          </p>
        )}
      </section>
    </>
  );
}

