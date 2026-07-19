"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/auth/redirects";
import type { AuthActionState } from "@/lib/auth/types";
import { translate } from "@/lib/i18n/functional";
import { getCurrentLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/i18n";
import { createClient } from "@/lib/supabase/server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorState(message: string): AuthActionState {
  return { message, status: "error" };
}

function credentialsFrom(formData: FormData, locale: Locale) {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email =
    typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!EMAIL_PATTERN.test(email)) {
    return {
      error: translate(locale, "Introduce una dirección de correo válida."),
      ok: false,
    } as const;
  }

  if (password.length < 8) {
    return {
      error: translate(locale, "La contraseña debe tener al menos 8 caracteres."),
      ok: false,
    } as const;
  }

  return { email, ok: true, password } as const;
}

function authErrorMessage(code: string | undefined, locale: Locale) {
  if (code === "email_not_confirmed") {
    return translate(locale, "Confirma tu correo antes de iniciar sesión.");
  }

  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
    return translate(
      locale,
      "Has hecho demasiados intentos. Espera unos minutos y vuelve a probar.",
    );
  }

  if (code === "user_already_exists") {
    return translate(
      locale,
      "No se pudo completar el registro. Prueba a iniciar sesión.",
    );
  }

  return translate(
    locale,
    "No se pudo completar la operación. Revisa los datos e inténtalo de nuevo.",
  );
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const locale = await getCurrentLocale();
  const credentials = credentialsFrom(formData, locale);
  if (!credentials.ok) {
    return errorState(credentials.error);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) {
      return errorState(authErrorMessage(error.code, locale));
    }
  } catch {
    return errorState(
      translate(
        locale,
        "La autenticación no está disponible ahora mismo. Inténtalo de nuevo.",
      ),
    );
  }

  redirect(safeRedirectPath(formData.get("next")));
}

export async function signupAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const locale = await getCurrentLocale();
  const credentials = credentialsFrom(formData, locale);
  if (!credentials.ok) {
    return errorState(credentials.error);
  }

  const displayNameValue = formData.get("displayName");
  const displayName =
    typeof displayNameValue === "string" ? displayNameValue.trim() : "";
  if (displayName.length < 2 || displayName.length > 80) {
    return errorState(
      translate(locale, "El nombre debe tener entre 2 y 80 caracteres."),
    );
  }

  let hasSession = false;
  try {
    const requestHeaders = await headers();
    const origin =
      requestHeaders.get("origin") ??
      "https://djorganizer-beta.vercel.app";
    const callbackUrl = new URL("/auth/callback", origin);
    callbackUrl.searchParams.set(
      "next",
      safeRedirectPath(formData.get("next")),
    );

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      return errorState(authErrorMessage(error.code, locale));
    }

    hasSession = Boolean(data.session);
  } catch {
    return errorState(
      translate(
        locale,
        "El registro no está disponible ahora mismo. Inténtalo de nuevo.",
      ),
    );
  }

  if (hasSession) {
    redirect(safeRedirectPath(formData.get("next")));
  }

  return {
    message: translate(
      locale,
      "Revisa tu correo para confirmar la cuenta y completar el acceso.",
    ),
    status: "success",
  };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
