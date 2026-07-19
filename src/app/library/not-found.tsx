import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";
import { translate } from "@/lib/i18n/functional";
import { getCurrentLocale } from "@/lib/i18n/server";

export default async function TrackNotFound() {
  const locale = await getCurrentLocale();
  const t = (message: Parameters<typeof translate>[1]) =>
    translate(locale, message);
  return (
    <EmptyState
      action={
        <Link className="button button--secondary" href="/library">
          {t("Volver a la biblioteca")}
        </Link>
      }
      description={t("La canción no existe o no pertenece a tu biblioteca.")}
      icon={<Icon name="library" />}
      title={t("Canción no encontrada")}
    />
  );
}
