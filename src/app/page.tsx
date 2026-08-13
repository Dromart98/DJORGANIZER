import Link from "next/link";
import { DashboardSummaryRecovery } from "@/components/dashboard/dashboard-summary-recovery";
import { GettingStartedGuide } from "@/components/onboarding/getting-started-guide";
import { Icon } from "@/components/layout/icon";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getOptionalUser } from "@/lib/auth/user";
import { translate } from "@/lib/i18n/functional";
import { getMessages } from "@/lib/i18n/i18n";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getOnboardingProgress } from "@/lib/onboarding/progress";
import {
  DASHBOARD_COUNT_OPERATIONS,
  loadDashboardSummary,
} from "@/lib/dashboard/summary";
import {
  applyDashboardE2EInjection,
  getDashboardE2EInjection,
} from "@/lib/dashboard/e2e-injection";
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
    const t = (message: Parameters<typeof translate>[1]) =>
      translate(locale, message);
    return (
      <>
        <PageHeader
          description={t("Importa tu música, completa solo los metadatos que conozcas y prepara tus sesiones.")}
          eyebrow="DJOrganizer"
          title={t("Tu música, lista para mezclar")}
        />
        <Card className="welcome">
          <div className="welcome-icon">
            <Icon name="music" />
          </div>
          <div>
            <p className="eyebrow">{t("Empieza aquí")}</p>
            <h2>{t("Organiza tu propia biblioteca")}</h2>
            <p>
              {t("Inicia sesión para importar canciones, analizar BPM y tonalidad, y crear crates sin datos ficticios.")}
            </p>
          </div>
          <div className="welcome-actions">
            <Link className="button button--primary" href="/login">
              {t("Iniciar sesión")}
            </Link>
            <Link className="button button--secondary" href="/signup">
              {t("Crear cuenta")}
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

  const e2eInjection = getDashboardE2EInjection(query.__e2eSummary);

  const supabase = await createClient();
  const summary = await loadDashboardSummary(async (operation) => {
    const injectedResult = await applyDashboardE2EInjection(
      e2eInjection,
      operation,
    );
    if (injectedResult) return injectedResult;
    return await supabase
      .from(operation)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
  });
  const failedOperations = DASHBOARD_COUNT_OPERATIONS.filter(
    (operation) => summary[operation].failure !== null,
  );
  if (failedOperations.length > 0) {
    console.error("Dashboard summary query failed", {
      operations: failedOperations.map((operation) => ({
        category: summary[operation].failure,
        operation,
      })),
    });
  }
  const counts = {
    crateCount: summary.crates.count ?? 0,
    trackCount: summary.tracks.count ?? 0,
  };
  const canShowOnboarding =
    summary.tracks.failure === null && summary.crates.failure === null;
  const onboarding = canShowOnboarding ? getOnboardingProgress(counts) : null;
  const copy = getMessages(locale).dashboard;

  return (
    <>
      <PageHeader
        description={copy.description}
        eyebrow={copy.eyebrow}
        title={copy.title}
      />
      {failedOperations.length > 0 ? (
        <DashboardSummaryRecovery
          clearE2EInjection={e2eInjection !== null}
          locale={locale}
        />
      ) : null}
      {onboarding && !onboarding.isComplete ? (
        <GettingStartedGuide counts={counts} locale={locale} />
      ) : null}
      <div className="stats">
        <Link className="card stats__link" href="/library">
          <span>{copy.stats.tracks}</span>
          <strong>{summary.tracks.count ?? copy.stats.unavailable}</strong>
          <small>{copy.stats.tracksHelp}</small>
        </Link>
        <Link className="card stats__link" href="/crates">
          <span>{copy.stats.crates}</span>
          <strong>{summary.crates.count ?? copy.stats.unavailable}</strong>
          <small>{copy.stats.cratesHelp}</small>
        </Link>
        <Link className="card stats__link" href="/crates#tags">
          <span>{copy.stats.tags}</span>
          <strong>{summary.tags.count ?? copy.stats.unavailable}</strong>
          <small>{copy.stats.tagsHelp}</small>
        </Link>
      </div>
      {onboarding?.isComplete ? (
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
