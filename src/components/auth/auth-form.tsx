"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, signupAction } from "@/app/auth/actions";
import { useTranslator } from "@/components/i18n/locale-provider";
import type { AuthActionState } from "@/lib/auth/types";

const INITIAL_STATE: AuthActionState = { message: "", status: "idle" };

function SubmitButton({ mode }: { mode: "login" | "signup" }) {
  const { pending } = useFormStatus();
  const { t } = useTranslator();
  const label = mode === "login" ? t("Iniciar sesión") : t("Crear cuenta");

  return (
    <button className="button button--primary auth-submit" disabled={pending}>
      {pending ? t("Procesando…") : label}
    </button>
  );
}

export function AuthForm({
  mode,
  nextPath = "/library",
  pageMessage,
}: {
  mode: "login" | "signup";
  nextPath?: string;
  pageMessage?: string;
}) {
  const action = mode === "login" ? loginAction : signupAction;
  const [state, formAction] = useActionState(action, INITIAL_STATE);
  const isLogin = mode === "login";
  const { t } = useTranslator();

  return (
    <div className="auth-card">
      <Link href="/" className="auth-brand">
        <span>DJ</span>Organizer
      </Link>
      <p className="eyebrow">{isLogin ? t("Bienvenido") : t("Nueva cuenta")}</p>
      <h1>
        {isLogin ? t("Accede a tu biblioteca") : t("Crea tu espacio musical")}
      </h1>
      <p className="auth-description">
        {isLogin
          ? t("Tus pistas, crates y etiquetas permanecerán aislados en tu cuenta.")
          : t("Empieza con una biblioteca privada preparada para crecer contigo.")}
      </p>

      {pageMessage ? (
        <p className="auth-message auth-message--error" role="alert">
          {pageMessage}
        </p>
      ) : null}

      <form action={formAction} className="auth-form">
        <input type="hidden" name="next" value={nextPath} />
        {!isLogin ? (
          <label>
            {t("Nombre")}
            <input
              autoComplete="name"
              maxLength={80}
              minLength={2}
              name="displayName"
              required
              type="text"
            />
          </label>
        ) : null}
        <label>
          {t("Correo")}
          <input
            autoComplete="email"
            inputMode="email"
            name="email"
            required
            type="email"
          />
        </label>
        <label>
          {t("Contraseña")}
          <input
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        {state.message ? (
          <p
            className={`auth-message auth-message--${state.status}`}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
        <SubmitButton mode={mode} />
      </form>

      <p className="auth-switch">
        {isLogin ? t("¿Aún no tienes cuenta?") : t("¿Ya tienes cuenta?")}{" "}
        <Link
          href={`${isLogin ? "/signup" : "/login"}?next=${encodeURIComponent(nextPath)}`}
        >
          {isLogin ? t("Regístrate") : t("Inicia sesión")}
        </Link>
      </p>
    </div>
  );
}

