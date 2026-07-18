import { notFound } from "next/navigation";
import { DeleteTrackForm } from "@/components/library/delete-track-form";
import { TrackForm } from "@/components/library/track-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { getTrack } from "@/lib/library/track-repository";
import { trackIdSchema } from "@/lib/library/track-schema";
import { createClient } from "@/lib/supabase/server";

type TrackDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata = { title: "Detalle de canción" };

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

  const query = await searchParams;

  return (
    <>
      <PageHeader
        action={
          <DeleteTrackForm title={track.title} trackId={track.id} />
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
      <TrackForm mode="update" track={track} />
    </>
  );
}
