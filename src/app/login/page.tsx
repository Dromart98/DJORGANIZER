import { AuthForm } from "@/components/auth/auth-form";
import { safeRedirectPath } from "@/lib/auth/redirects";

export const metadata = { title: "Iniciar sesión" };

const ERROR_MESSAGES: Record<string, string> = {
  configuration:
    "La conexión de autenticación todavía no está disponible en este entorno.",
  confirmation:
    "No se pudo confirmar la cuenta. Solicita un nuevo enlace e inténtalo otra vez.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      mode="login"
      nextPath={safeRedirectPath(params.next)}
      pageMessage={params.error ? ERROR_MESSAGES[params.error] : undefined}
    />
  );
}

