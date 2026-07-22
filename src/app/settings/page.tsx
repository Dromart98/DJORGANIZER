import { logoutAction } from "@/app/auth/actions";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { BackupManager } from "@/components/settings/backup-manager";
import { LocaleSwitcher } from "@/components/settings/locale-switcher";
import { requireUser } from "@/lib/auth/user";
import { translate } from "@/lib/i18n/functional";
import { getCurrentLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const locale = await getCurrentLocale();
  return { title: translate(locale, "Ajustes") };
}

export default async function SettingsPage() {
  const [user, locale] = await Promise.all([requireUser(), getCurrentLocale()]);
  const t = (message: Parameters<typeof translate>[1]) =>
    translate(locale, message);

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title={t("Ajustes")}
        description={t("Cuenta y estado actual de DJOrganizer.")}
      />
      <Card className="settings-card">
        <div>
          <h2>{t("Cuenta conectada")}</h2>
          <p>{user.email ?? t("Usuario autenticado")}</p>
        </div>
        <span className="badge">{t("Cuenta protegida")}</span>
      </Card>
      <Card className="settings-card">
        <div>
          <h2>{t("Modo de biblioteca")}</h2>
          <p>{t("Datos persistentes con cola de metadatos offline y sincronización al recuperar la conexión.")}</p>
        </div>
        <span className="badge muted-badge">Local-first</span>
      </Card>
      <Card className="settings-card">
        <div>
          <h2>{t("Idioma / Language")}</h2>
          <LocaleSwitcher locale={locale} />
        </div>
        <span className="badge">{locale.toUpperCase()}</span>
      </Card>
      <Card className="settings-card">
        <div>
          <h2>{t("Copias de seguridad")}</h2>
          <p>{t("Exporta y restaura pistas, crates, jerarquías y etiquetas en un formato versionado.")}</p>
          <BackupManager />
        </div>
        <span className="badge">Backup v1</span>
      </Card>
      <form action={logoutAction}>
        <button className="button button--secondary" type="submit">
          {t("Cerrar sesión")}
        </button>
      </form>
    </>
  );
}
