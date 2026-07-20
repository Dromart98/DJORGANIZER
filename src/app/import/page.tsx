import { DesktopFolderScanner } from "@/components/desktop/folder-scanner";
import { AudioImporter } from "@/components/import/audio-importer";
import { ImportGuidance } from "@/components/import/import-guidance";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";
import { translate } from "@/lib/i18n/functional";
import { getCurrentLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return { title: translate(locale, "Importar") };
}

export default async function ImportPage() {
  const [, locale] = await Promise.all([requireUser(), getCurrentLocale()]);
  const t = (message: Parameters<typeof translate>[1]) =>
    translate(locale, message);

  return (
    <>
      <PageHeader
        eyebrow={t("Colección")}
        title={t("Importar música")}
        description={t("Selecciona archivos, revisa BPM y tonalidad, y guarda los metadatos.")}
      />
      <ImportGuidance locale={locale} />
      <div className="import-flow">
        <DesktopFolderScanner />
        <AudioImporter />
      </div>
    </>
  );
}

