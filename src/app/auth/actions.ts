"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/auth/redirects";
import type { AuthActionState } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorState(message: string): AuthActionState {
  return { message, status: "error" };
}

function credentialsFrom(formData: FormData) {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email =
    typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Introduce una dirección de correo válida." } as const;
  }

  if (password.length < 8) {
    return {
      error: "La contraseña debe tener al menos 8 caracteres.",
    } as const;
  }

  return { email, password } as const;
}

function authErrorMessage(code: string | undefined) {
  if (code === "email_not_confirmed") {
    return "Confirma tu correo antes de iniciar sesión.";
  }

  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
    return "Has hecho demasiados intentos. Espera unos minutos y vuelve a probar.";
  }

  if (code === "user_already_exists") {
    return "No se pudo completar el registro. Prueba a iniciar sesión.";
  }

  return "No se pudo completar la operación. Revisa los datos e inténtalo de nuevo.";
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = credentialsFrom(formData);
  if ("error" in credentials) {
    return errorState(credentials.error);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) {
      return errorState(authErrorMessage(error.code));
    }
  } catch {
    return errorState(
      "La autenticación no está disponible ahora mismo. Inténtalo de nuevo.",
    );
  }

  redirect(safeRedirectPath(formData.get("next")));
}

export async function signupAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = credentialsFrom(formData);
  if ("error" in credentials) {
    return errorState(credentials.error);
  }

  const displayNameValue = formData.get("displayName");
  const displayName =
    typeof displayNameValue === "string" ? displayNameValue.trim() : "";
  if (displayName.length < 2 || displayName.length > 80) {
    return errorState("El nombre debe tener entre 2 y 80 caracteres.");
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
      ...credentials,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      return errorState(authErrorMessage(error.code));
    }

    hasSession = Boolean(data.session);
  } catch {
    return errorState(
      "El registro no está disponible ahora mismo. Inténtalo de nuevo.",
    );
  }

  if (hasSession) {
    redirect(safeRedirectPath(formData.get("next")));
  }

  return {
    message: "Revisa tu correo para confirmar la cuenta y completar el acceso.",
    status: "success",
  };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
