import { AuthForm } from "@/components/auth/auth-form";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { translate } from "@/lib/i18n/functional";
import { getCurrentLocale } from "@/lib/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getCurrentLocale();
  return { title: translate(locale, "Iniciar sesión") };
}

const ERROR_MESSAGES = {
  configuration:
    "La conexión de autenticación todavía no está disponible en este entorno.",
  confirmation:
    "No se pudo confirmar la cuenta. Solicita un nuevo enlace e inténtalo otra vez.",
} as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const [params, locale] = await Promise.all([searchParams, getCurrentLocale()]);
  const error = params.error as keyof typeof ERROR_MESSAGES | undefined;
  return (
    <AuthForm
      mode="login"
      nextPath={safeRedirectPath(params.next)}
      pageMessage={
        error && ERROR_MESSAGES[error]
          ? translate(locale, ERROR_MESSAGES[error])
          : undefined
      }
    />
  );
}

