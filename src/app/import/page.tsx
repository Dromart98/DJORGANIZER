import { DesktopFolderScanner } from "@/components/desktop/folder-scanner";
import { AudioImporter } from "@/components/import/audio-importer";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";

export const metadata = { title: "Importar" };

export default async function ImportPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        eyebrow="Colección"
        title="Importar música"
        description="Selecciona archivos y DJOrganizer estimará automáticamente BPM y tonalidad en este dispositivo; después revisa y guarda solo los metadatos."
      />
      <div className="import-flow">
        <DesktopFolderScanner />
        <AudioImporter />
      </div>
    </>
  );
}

