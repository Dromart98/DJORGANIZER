import Link from "next/link";
import { LibraryHealthDesktop } from "@/components/library/library-health-desktop";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getLibraryHealth } from "@/lib/library/library-health";
import { createClient } from "@/lib/supabase/server";
import styles from "./library-health.module.css";

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return { title: locale === "en" ? "Library health" : "Salud de la biblioteca" };
}

export default async function LibraryHealthPage() {
  const [user, locale] = await Promise.all([requireUser(), getCurrentLocale()]);
  const supabase = await createClient();
  const health = await getLibraryHealth(supabase, user.id);
  const en = locale === "en";

  const metrics = [
    {
      count: health.total,
      label: en ? "Tracks in library" : "Pistas en biblioteca",
    },
    {
      count: health.needsAnalysis,
      label: en ? "Missing BPM or key" : "Sin BPM o tonalidad",
    },
    {
      count: health.missingGenre,
      label: en ? "Missing genre" : "Sin género",
    },
    {
      count: health.missingDuration,
      label: en ? "Missing duration" : "Sin duración",
    },
    {
      count: health.missingFileIdentity,
      label: en ? "Without file identity" : "Sin identidad de archivo",
    },
  ];

  return (
    <>
      <PageHeader
        action={
          <div className={styles.actions}>
            <Link className="button button--secondary" href="/library">
              {en ? "Back to library" : "Volver a Biblioteca"}
            </Link>
            <Link className="button button--primary" href="/import">
              {en ? "Check local folder" : "Comprobar carpeta local"}
            </Link>
          </div>
        }
        description={
          en
            ? "Find library and local-file problems without changing metadata or files automatically."
            : "Detecta problemas de biblioteca y archivos locales sin modificar metadatos ni archivos automáticamente."
        }
        eyebrow={en ? "Maintenance" : "Mantenimiento"}
        title={en ? "Library health" : "Salud de la biblioteca"}
      />

      <div className={styles.summaryGrid}>
        {metrics.map((metric) => (
          <div className={`card ${styles.metric}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.count.toLocaleString(locale)}</strong>
          </div>
        ))}
      </div>

      <section className={styles.section} aria-labelledby="metadata-health-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className="eyebrow">{en ? "Library data" : "Datos de biblioteca"}</p>
            <h2 id="metadata-health-title">
              {en ? "Incomplete metadata" : "Metadatos incompletos"}
            </h2>
            <p className={styles.sectionIntro}>
              {en
                ? "These checks use only your stored library. Missing subgenre is not treated as an error because it may be genuinely indeterminate."
                : "Estas comprobaciones usan únicamente tu biblioteca guardada. La ausencia de subgénero no se considera un error porque puede ser realmente indeterminable."}
            </p>
          </div>
        </div>

        <div className={styles.issueGrid}>
          <div className={`card ${styles.issueCard}`}>
            <span>BPM</span>
            <strong>{health.missingBpm.toLocaleString(locale)}</strong>
            <small className={styles.detail}>
              {en ? "Tracks without a stored BPM." : "Pistas sin BPM guardado."}
            </small>
          </div>
          <div className={`card ${styles.issueCard}`}>
            <span>{en ? "Key" : "Tonalidad"}</span>
            <strong>{health.missingKey.toLocaleString(locale)}</strong>
            <small className={styles.detail}>
              {en
                ? "Tracks without a normalized musical key."
                : "Pistas sin tonalidad musical normalizada."}
            </small>
          </div>
          <div className={`card ${styles.issueCard}`}>
            <span>{en ? "Genre" : "Género"}</span>
            <strong>{health.missingGenre.toLocaleString(locale)}</strong>
            <small className={styles.detail}>
              {en ? "Tracks without a genre value." : "Pistas sin valor de género."}
            </small>
          </div>
          <div className={`card ${styles.issueCard}`}>
            <span>{en ? "Duration" : "Duración"}</span>
            <strong>{health.missingDuration.toLocaleString(locale)}</strong>
            <small className={styles.detail}>
              {en ? "Tracks without a stored duration." : "Pistas sin duración guardada."}
            </small>
          </div>
          <div className={`card ${styles.issueCard}`}>
            <span>{en ? "File identity" : "Identidad de archivo"}</span>
            <strong>{health.missingFileIdentity.toLocaleString(locale)}</strong>
            <small className={styles.detail}>
              {en
                ? "Tracks without fingerprint or file size cannot be linked reliably to a desktop scan."
                : "Las pistas sin huella o tamaño de archivo no pueden vincularse de forma fiable a un escaneo de escritorio."}
            </small>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="analysis-health-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className="eyebrow">{en ? "Local analysis" : "Análisis local"}</p>
            <h2 id="analysis-health-title">
              {en ? "Tracks to review" : "Pistas para revisar"}
            </h2>
            <p className={styles.sectionIntro}>
              {en
                ? "Open a track explicitly to use the existing local analysis flow. Nothing is applied automatically from this page."
                : "Abre una pista de forma explícita para usar el análisis local existente. Desde esta página no se aplica nada automáticamente."}
            </p>
          </div>
          <strong>{health.needsAnalysis.toLocaleString(locale)}</strong>
        </div>

        {health.needsAnalysisTracks.length ? (
          <div className="card">
            <ul className={styles.trackList}>
              {health.needsAnalysisTracks.map((track) => (
                <li className={styles.trackRow} key={track.id}>
                  <span className={styles.trackIdentity}>
                    <strong>{track.title}</strong>
                    <span>{track.artist ?? (en ? "Unknown artist" : "Artista desconocido")}</span>
                    <small>
                      BPM: {track.bpm ?? "—"} · {en ? "Key" : "Tonalidad"}: {track.musicalKey ?? "—"}
                    </small>
                  </span>
                  <Link
                    className="button button--secondary button--small"
                    href={`/library/${track.id}`}
                  >
                    {en ? "Review and analyze" : "Revisar y analizar"}
                  </Link>
                </li>
              ))}
            </ul>
            {health.needsAnalysis > health.needsAnalysisTracks.length ? (
              <p className={styles.sectionIntro}>
                {en
                  ? `Showing the first ${health.needsAnalysisTracks.length} tracks.`
                  : `Se muestran las primeras ${health.needsAnalysisTracks.length} pistas.`}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="card">
            <p className={styles.sectionIntro}>
              {en
                ? "All tracks currently have BPM and key."
                : "Todas las pistas tienen actualmente BPM y tonalidad."}
            </p>
          </div>
        )}
      </section>

      <LibraryHealthDesktop locale={locale} />
    </>
  );
}
