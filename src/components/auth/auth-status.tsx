import Link from "next/link";
import { getOptionalUser } from "@/lib/auth/user";

export async function AuthStatus() {
  const user = await getOptionalUser();

  if (!user) {
    return (
      <div className="sidebar-status">
        <span className="status-dot status-dot--muted" />
        Sin sesión
        <p>
          <Link href="/login">Iniciar sesión</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="sidebar-status">
      <span className="status-dot" />
      Sesión activa
      <p title={user.email ?? undefined}>{user.email ?? "Usuario conectado"}</p>
    </div>
  );
}

