import Link from "next/link";
import { LostTrackRepair } from "@/components/library/lost-track-repair";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { getCurrentLocale } from "@/lib/i18n/server";
import styles from "./lost-track-repair.module.css";

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return {
    title:
      locale === "en"
        ? "Repair lost track references"
        : "Reparar referencias perdidas",
  };
}

export default async function LostTrackRepairPage() {
  const [, locale] = await Promise.all([requireUser(), getCurrentLocale()]);
  const en = locale === "en";

  return (
    <>
      <PageHeader
        action={
          <div className={styles.actions}>
            <Link className="button button--secondary" href="/library/health">
              {en ? "Library health" : "Salud de la biblioteca"}
            </Link>
            <Link className="button button--secondary" href="/import">
              {en ? "Refresh local folder" : "Actualizar carpeta local"}
            </Link>
          </div>
        }
        description={
          en
            ? "Reconnect a lost library reference to a verified file candidate from the active desktop scan."
            : "Vuelve a conectar una referencia perdida de la biblioteca con un candidato de archivo verificable del escaneo de escritorio activo."
        }
        eyebrow={en ? "Maintenance" : "Mantenimiento"}
        title={en ? "Repair lost references" : "Reparar referencias perdidas"}
      />

      <div className={`card ${styles.intro}`}>
        <strong>{en ? "No automatic matches" : "Sin coincidencias automáticas"}</strong>
        <p className={styles.muted}>
          {en
            ? "DJOrganizer shows only candidates supported by strong evidence. You choose the file, and the desktop app verifies the scan version and fingerprint again immediately before saving the local alias. Absolute paths never leave the native session."
            : "DJOrganizer muestra únicamente candidatos respaldados por evidencia sólida. Tú eliges el archivo y la aplicación de escritorio vuelve a verificar la versión del escaneo y la huella justo antes de guardar el alias local. Las rutas absolutas nunca salen de la sesión nativa."}
        </p>
      </div>

      <LostTrackRepair locale={locale} />
    </>
  );
}
