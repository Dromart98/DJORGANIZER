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
        description="Lee etiquetas y estima el BPM en este dispositivo; después revisa y guarda únicamente los metadatos."
      />
      <AudioImporter />
    </>
  );
}

