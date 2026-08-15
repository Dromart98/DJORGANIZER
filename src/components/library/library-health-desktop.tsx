"use client";

import Link from "next/link";
import { useDesktopScanSession } from "@/components/desktop/scan-session-provider";
import type { Locale } from "@/lib/i18n/i18n";
import styles from "@/app/library/health/library-health.module.css";

const PREVIEW_LIMIT = 8;

export function LibraryHealthDesktop({ locale }: { locale: Locale }) {
  const {
    linkedScanIds,
    linksReady,
    missingTrackIds,
    pathChanges,
    scanHealth,
  } = useDesktopScanSession();
  const en = locale === "en";

  if (!scanHealth) {
    return (
      <section className={`card ${styles.section}`}>
        <div>
          <p className="eyebrow">{en ? "Local files" : "Archivos locales"}</p>
          <h2>{en ? "Check the confirmed folder" : "Comprobar la carpeta confirmada"}</h2>
        </div>
        <p className={styles.sectionIntro}>
          {en
            ? "Open DJOrganizer on desktop and scan your music folder to detect unreadable files, local duplicates, unimported tracks and later file changes. Absolute paths remain inside the native session."
            : "Abre DJOrganizer en escritorio y escanea tu carpeta de música para detectar archivos ilegibles, duplicados locales, pistas sin importar y cambios posteriores. Las rutas absolutas permanecen dentro de la sesión nativa."}
        </p>
        <div className={styles.actions}>
          <Link className="button button--secondary" href="/import">
            {en ? "Open folder scan" : "Abrir escaneo de carpeta"}
          </Link>
        </div>
      </section>
    );
  }

  const linked = new Set(linkedScanIds);
  const unreadable = scanHealth.tracks.filter((track) => !track.metadataRead);
  const duplicates = scanHealth.tracks.filter((track) => track.duplicateGroup);
  const unimported = linksReady
    ? scanHealth.tracks.filter((track) => !linked.has(track.scanId))
    : [];

  const localIssues = [
    {
      count: missingTrackIds.length,
      description: en
        ? "Previously linked tracks that disappeared after refreshing the same folder."
        : "Pistas antes vinculadas que desaparecieron al actualizar la misma carpeta.",
      label: en ? "Missing files" : "Archivos no encontrados",
    },
    {
      count: unreadable.length,
      description: en
        ? "Files whose container or embedded metadata could not be read."
        : "Archivos cuyo contenedor o metadatos incrustados no se pudieron leer.",
      label: en ? "Unreadable files" : "Archivos ilegibles",
    },
    {
      count: pathChanges.length,
      description: en
        ? "Linked tracks detected at a different relative path after refreshing the folder."
        : "Pistas vinculadas detectadas en otra ruta relativa tras actualizar la carpeta.",
      label: en ? "Changed paths" : "Rutas modificadas",
    },
    {
      count: unimported.length,
      description: linksReady
        ? en
          ? "Files found in the confirmed folder that are not linked to your DJOrganizer library."
          : "Archivos presentes en la carpeta confirmada que no están vinculados a tu biblioteca de DJOrganizer."
        : en
          ? "Library matching has not completed for this scan."
          : "La vinculación con la biblioteca no se ha completado para este escaneo.",
      label: en ? "Not imported" : "Sin importar",
    },
    {
      count: scanHealth.duplicateTracks,
      description: en
        ? `${scanHealth.duplicateGroups} exact local duplicate groups detected by fingerprint.`
        : `${scanHealth.duplicateGroups} grupos de duplicados locales exactos detectados por huella.`,
      label: en ? "Possible duplicates" : "Posibles duplicados",
    },
    {
      count: scanHealth.fingerprintFailures,
      description: en
        ? "Files whose fingerprint could not be verified during this scan."
        : "Archivos cuya huella no se pudo verificar durante este escaneo.",
      label: en ? "Fingerprint failures" : "Fallos de huella",
    },
  ];

  return (
    <section className={styles.section} aria-labelledby="local-health-title">
      <div className={styles.sectionHeader}>
        <div>
          <p className="eyebrow">{en ? "Local files" : "Archivos locales"}</p>
          <h2 id="local-health-title">
            {en ? `Folder: ${scanHealth.rootName}` : `Carpeta: ${scanHealth.rootName}`}
          </h2>
          <p className={styles.sectionIntro}>
            {en
              ? "Results come only from the active native scan session."
              : "Los resultados proceden únicamente de la sesión de escaneo nativa activa."}
          </p>
        </div>
        <Link className="button button--secondary" href="/import">
          {en ? "Refresh folder" : "Actualizar carpeta"}
        </Link>
      </div>

      {scanHealth.truncated ? (
        <p className="form-message form-message--error" role="alert">
          {en
            ? "The scan reached its safety limit. Local health counts may be incomplete."
            : "El escaneo alcanzó su límite de seguridad. Los recuentos locales pueden estar incompletos."}
        </p>
      ) : null}

      <div className={styles.issueGrid}>
        {localIssues.map((issue) => (
          <div className={`card ${styles.issueCard}`} key={issue.label}>
            <span>{issue.label}</span>
            <strong>{issue.count.toLocaleString(locale)}</strong>
            <small className={styles.detail}>{issue.description}</small>
          </div>
        ))}
      </div>

      {unreadable.length ? (
        <div className="card">
          <h3>{en ? "Unreadable file sample" : "Muestra de archivos ilegibles"}</h3>
          <ul className={styles.pathList}>
            {unreadable.slice(0, PREVIEW_LIMIT).map((track) => (
              <li className={styles.pathRow} key={track.scanId}>
                <span className={styles.pathIdentity}>{track.relativePath}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {linksReady && unimported.length ? (
        <div className="card">
          <h3>{en ? "Files not imported" : "Archivos sin importar"}</h3>
          <ul className={styles.pathList}>
            {unimported.slice(0, PREVIEW_LIMIT).map((track) => (
              <li className={styles.pathRow} key={track.scanId}>
                <span className={styles.pathIdentity}>{track.relativePath}</span>
              </li>
            ))}
          </ul>
          <Link className="button button--secondary button--small" href="/import">
            {en ? "Review import" : "Revisar importación"}
          </Link>
        </div>
      ) : null}

      {duplicates.length ? (
        <div className="card">
          <h3>{en ? "Local duplicate sample" : "Muestra de duplicados locales"}</h3>
          <ul className={styles.pathList}>
            {duplicates.slice(0, PREVIEW_LIMIT).map((track) => (
              <li className={styles.pathRow} key={track.scanId}>
                <span className={styles.pathIdentity}>{track.relativePath}</span>
                <small>{track.duplicateGroup}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pathChanges.length ? (
        <div className="card">
          <h3>{en ? "Detected path changes" : "Cambios de ruta detectados"}</h3>
          <ul className={styles.pathList}>
            {pathChanges.slice(0, PREVIEW_LIMIT).map((change) => (
              <li className={styles.pathRow} key={change.trackId}>
                <span className={styles.pathIdentity}>
                  <small>{change.from}</small>
                  <strong>→ {change.to}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
