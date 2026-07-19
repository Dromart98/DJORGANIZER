import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/layout/icon";
import { translate } from "@/lib/i18n/functional";
import { getCurrentLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return { title: translate(locale, "Página no encontrada") };
}

export default async function NotFound() {
  const locale = await getCurrentLocale();
  const t = (message: Parameters<typeof translate>[1]) =>
    translate(locale, message);
  return (
    <EmptyState
      icon={<Icon name="music" />}
      title={t("Página no encontrada")}
      description={t("La dirección solicitada no existe en DJOrganizer.")}
      action={
        <Link href="/" className="button button--primary">
          {t("Volver al inicio")}
        </Link>
      }
    />
  );
}
