import Link from "next/link";
import { Icon } from "@/components/layout/icon";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getOptionalUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const user = await getOptionalUser();

  if (!user) {
    return (
      <>
        <PageHeader
          description="Importa tu música, completa solo los metadatos que conozcas y prepara tus sesiones."
          eyebrow="DJOrganizer"
          title="Tu música, lista para mezclar"
        />
        <Card className="welcome">
          <div className="welcome-icon">
            <Icon name="music" />
          </div>
          <div>
            <p className="eyebrow">Empieza aquí</p>
            <h2>Organiza tu propia biblioteca</h2>
            <p>
              Inicia sesión para importar canciones, analizar BPM y tonalidad,
              y crear crates sin datos ficticios.
            </p>
          </div>
          <div className="welcome-actions">
            <Link className="button button--primary" href="/login">
              Iniciar sesión
            </Link>
            <Link className="button button--secondary" href="/signup">
              Crear cuenta
            </Link>
          </div>
        </Card>
      </>
    );
  }

  const supabase = await createClient();
  const [tracks, crates, tags] = await Promise.all([
    supabase
      .from("tracks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("crates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("tags")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);
  if (tracks.error || crates.error || tags.error) {
    throw new Error("No se pudo cargar el resumen de tu biblioteca.");
  }

  return (
    <>
      <PageHeader
        description="Resumen real de tu biblioteca privada."
        eyebrow="Resumen"
        title="Tu música, lista para mezclar"
      />
      <div className="stats">
        <Card>
          <span>Pistas</span>
          <strong>{tracks.count ?? 0}</strong>
          <small>En tu biblioteca</small>
        </Card>
        <Card>
          <span>Crates</span>
          <strong>{crates.count ?? 0}</strong>
          <small>Sesiones preparadas</small>
        </Card>
        <Card>
          <span>Etiquetas</span>
          <strong>{tags.count ?? 0}</strong>
          <small>Clasificación personal</small>
        </Card>
      </div>
      <Card className="welcome">
        <div className="welcome-icon">
          <Icon name="music" />
        </div>
        <div>
          <p className="eyebrow">Biblioteca real</p>
          <h2>Importa tu música</h2>
          <p>
            El artista es opcional. El nombre de archivo se usa como título
            inicial y puedes trabajar únicamente con BPM y tonalidad.
          </p>
        </div>
        <Link className="button button--primary" href="/import">
          Importar canciones →
        </Link>
      </Card>
    </>
  );
}
