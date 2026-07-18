import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";

export default function TrackNotFound() {
  return (
    <EmptyState
      action={
        <Link className="button button--secondary" href="/library">
          Volver a la biblioteca
        </Link>
      }
      description="La canción no existe o no pertenece a tu biblioteca."
      icon={<Icon name="library" />}
      title="Canción no encontrada"
    />
  );
}
