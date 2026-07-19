import { logoutAction } from "@/app/auth/actions";
import { cookies } from "next/headers";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { BackupManager } from "@/components/settings/backup-manager";
import { DesktopUpdateManager } from "@/components/settings/desktop-update-manager";
import { LocaleSwitcher } from "@/components/settings/locale-switcher";
import { PrivacyDiagnostics } from "@/components/settings/privacy-diagnostics";
import { requireUser } from "@/lib/auth/user";
import { DJ_LIBRARY_PROVIDERS } from "@/lib/integrations/contracts";
import { resolveLocale } from "@/lib/i18n/i18n";

export const metadata = { title: "Ajustes" };
export default async function SettingsPage() {
  const user = await requireUser();
  const cookieStore = await cookies();
  const locale = resolveLocale(cookieStore.get("djorganizer-locale")?.value);

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Ajustes"
        description="Cuenta y estado actual de DJOrganizer."
      />
      <Card className="settings-card">
        <div>
          <h2>Cuenta conectada</h2>
          <p>{user.email ?? "Usuario autenticado"}</p>
        </div>
        <span className="badge">Supabase Auth</span>
      </Card>
      <Card className="settings-card">
        <div>
          <h2>Modo de biblioteca</h2>
          <p>
            Datos persistentes con cola de metadatos offline y sincronización al
            recuperar la conexión.
          </p>
        </div>
        <span className="badge muted-badge">Local-first</span>
      </Card>
      <Card className="settings-card">
        <div>
          <h2>Diagnóstico privado</h2>
          <p>
            Registra localmente hasta 100 errores técnicos saneados. No envía
            telemetría ni incluye música, rutas, cuenta o credenciales.
          </p>
          <PrivacyDiagnostics />
        </div>
        <span className="badge muted-badge">Solo local</span>
      </Card>
      <Card className="settings-card">
        <div>
          <h2>Actualizaciones de escritorio</h2>
          <p>
            Los instaladores comprueban versiones firmadas publicadas en GitHub.
          </p>
          <DesktopUpdateManager />
        </div>
        <span className="badge muted-badge">Firmadas</span>
      </Card>
      <Card className="settings-card">
        <div>
          <h2>Idioma / Language</h2>
          <LocaleSwitcher locale={locale} />
        </div>
        <span className="badge">{locale.toUpperCase()}</span>
      </Card>
      <Card className="settings-card">
        <div>
          <h2>Copias de seguridad</h2>
          <p>
            Exporta y restaura pistas, crates, jerarquías y etiquetas en un
            formato versionado.
          </p>
          <BackupManager />
        </div>
        <span className="badge">Backup v1</span>
      </Card>
      <Card className="settings-card">
        <div>
          <h2>Integraciones DJ</h2>
          <p>
            {DJ_LIBRARY_PROVIDERS.map(
              (provider) =>
                `${provider.displayName}: ${
                  provider.status === "available" ? "disponible" : "preparada"
                }`,
            ).join(" · ")}
          </p>
        </div>
        <span className="badge muted-badge">Contratos estables</span>
      </Card>
      <form action={logoutAction}>
        <button className="button button--secondary" type="submit">
          Cerrar sesión
        </button>
      </form>
    </>
  );
}
