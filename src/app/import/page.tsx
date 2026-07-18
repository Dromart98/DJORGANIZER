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
        description="Lee las etiquetas de tus archivos en este dispositivo, revísalas y guarda únicamente sus metadatos."
      />
      <AudioImporter />
    </>
  );
}

