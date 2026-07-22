import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AuthenticatedUser = {
  displayName: string | null;
  email: string | null;
  id: string;
};

export function userFromClaims(claims: Record<string, unknown> | undefined) {
  const id = claims?.sub;
  if (typeof id !== "string") {
    return null;
  }

  const metadata = claims?.user_metadata;
  const displayName =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).display_name
      : null;

  return {
    displayName:
      typeof displayName === "string" && displayName.trim() !== ""
        ? displayName.trim()
        : null,
    email: typeof claims?.email === "string" ? claims.email : null,
    id,
  } satisfies AuthenticatedUser;
}

export function getUserDisplayName(
  user: AuthenticatedUser,
  fallback: string,
) {
  return user.displayName ?? fallback;
}

export async function getOptionalUser() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error) {
    return null;
  }

  return userFromClaims(data?.claims);
}

export async function requireUser() {
  const user = await getOptionalUser();
  if (!user) {
    redirect("/login");
  }

  return user;
}
