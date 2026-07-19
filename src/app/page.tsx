import Link from "next/link";
import { GettingStartedGuide } from "@/components/onboarding/getting-started-guide";
import { Icon } from "@/components/layout/icon";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getOptionalUser } from "@/lib/auth/user";
import { getMessages } from "@/lib/i18n/i18n";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getOnboardingProgress } from "@/lib/onboarding/progress";
import { createClient } from "@/lib/supabase/server";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const [user, locale] = await Promise.all([
    getOptionalUser(),
    getCurrentLocale(),
  ]);

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

  const query = await searchParams;
  if (
    process.env.E2E_AUTHENTICATED === "1" &&
    query.__e2eError === "1"
  ) {
    throw new Error("Controlled route failure for end-to-end recovery.");
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
  const counts = {
    crateCount: crates.count ?? 0,
    trackCount: tracks.count ?? 0,
  };
  const onboarding = getOnboardingProgress(counts);
  const copy = getMessages(locale).dashboard;

  return (
    <>
      <PageHeader
        description={copy.description}
        eyebrow={copy.eyebrow}
        title={copy.title}
      />
      {!onboarding.isComplete ? (
        <GettingStartedGuide counts={counts} locale={locale} />
      ) : null}
      <div className="stats">
        <Card>
          <span>{copy.stats.tracks}</span>
          <strong>{tracks.count ?? 0}</strong>
          <small>{copy.stats.tracksHelp}</small>
        </Card>
        <Card>
          <span>{copy.stats.crates}</span>
          <strong>{crates.count ?? 0}</strong>
          <small>{copy.stats.cratesHelp}</small>
        </Card>
        <Card>
          <span>{copy.stats.tags}</span>
          <strong>{tags.count ?? 0}</strong>
          <small>{copy.stats.tagsHelp}</small>
        </Card>
      </div>
      {onboarding.isComplete ? (
        <Card className="welcome">
          <div className="welcome-icon">
            <Icon name="music" />
          </div>
          <div>
            <p className="eyebrow">{copy.normalEyebrow}</p>
            <h2>{copy.normalTitle}</h2>
            <p>{copy.normalDescription}</p>
          </div>
          <Link className="button button--primary" href="/crates">
            {copy.normalAction}
          </Link>
        </Card>
      ) : null}
    </>
  );
}
