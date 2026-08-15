import Link from "next/link";
import {
  getOptionalUser,
  getUserDisplayName,
  type AuthenticatedUser,
} from "@/lib/auth/user";
import { getMessages, type Locale } from "@/lib/i18n/i18n";

export async function AuthStatus({
  locale,
  user: suppliedUser,
}: {
  locale: Locale;
  user?: AuthenticatedUser | null;
}) {
  const user = suppliedUser === undefined ? await getOptionalUser() : suppliedUser;
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
      <p className="sidebar-status__identity" title={getUserDisplayName(user, copy.connectedUser)}>
        {getUserDisplayName(user, copy.connectedUser)}
      </p>
    </div>
  );
}
