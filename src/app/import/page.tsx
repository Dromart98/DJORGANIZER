import { DesktopFolderScanner } from "@/components/desktop/folder-scanner";
import { AudioImporter } from "@/components/import/audio-importer";
import { ImportGuidance } from "@/components/import/import-guidance";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { getCurrentLocale } from "@/lib/i18n/server";

export const metadata = { title: "Importar" };

export default async function ImportPage() {
  const [, locale] = await Promise.all([requireUser(), getCurrentLocale()]);

  return (
    <>
      <PageHeader
        eyebrow="Colección"
        title="Importar música"
        description="Selecciona archivos y DJOrganizer estimará automáticamente BPM y tonalidad en este dispositivo; después revisa y guarda solo los metadatos."
      />
      <ImportGuidance locale={locale} />
      <div className="import-flow">
        <DesktopFolderScanner />
        <AudioImporter />
      </div>
    </>
  );
}

