import { TrackForm } from "@/components/library/track-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { translate } from "@/lib/i18n/functional";
import { getCurrentLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return { title: translate(locale, "Añadir canción") };
}

export default async function NewTrackPage() {
  const [, locale] = await Promise.all([requireUser(), getCurrentLocale()]);
  const t = (message: Parameters<typeof translate>[1]) =>
    translate(locale, message);

  return (
    <>
      <PageHeader
        description={t("Guarda sus metadatos ahora; el archivo de audio no se subirá.")}
        eyebrow={t("Biblioteca")}
        title={t("Añadir canción")}
      />
      <TrackForm mode="create" />
    </>
  );
}
