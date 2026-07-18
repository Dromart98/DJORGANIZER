import { logoutAction } from "@/app/auth/actions";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/user";

export const metadata = { title: "Ajustes" };
export default async function SettingsPage() {
  const user = await requireUser();

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
            La vista musical sigue usando datos de demostración hasta la
            siguiente fase.
          </p>
        </div>
        <span className="badge muted-badge">Demo separada</span>
      </Card>
      <form action={logoutAction}>
        <button className="button button--secondary" type="submit">
          Cerrar sesión
        </button>
      </form>
    </>
  );
}
