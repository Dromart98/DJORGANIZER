import Link from "next/link";
import { getOptionalUser } from "@/lib/auth/user";
import { getMessages, type Locale } from "@/lib/i18n/i18n";

export async function AuthStatus({ locale }: { locale: Locale }) {
  const user = await getOptionalUser();
  const copy = getMessages(locale).auth;

  if (!user) {
    return (
      <div className="sidebar-status">
        <span className="status-dot status-dot--muted" />
        {copy.signedOut}
        <p>
          <Link href="/login">{copy.signIn}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="sidebar-status">
      <span className="status-dot" />
      {copy.active}
      <p title={user.email ?? undefined}>{user.email ?? copy.connectedUser}</p>
    </div>
  );
}

