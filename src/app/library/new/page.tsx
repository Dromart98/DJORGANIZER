import { TrackForm } from "@/components/library/track-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";

export const metadata = { title: "Añadir canción" };

export default async function NewTrackPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        description="Guarda sus metadatos ahora; el archivo de audio no se subirá."
        eyebrow="Biblioteca"
        title="Añadir canción"
      />
      <TrackForm mode="create" />
    </>
  );
}
