import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AuthenticatedUser = {
  email: string | null;
  id: string;
};

function userFromClaims(claims: Record<string, unknown> | undefined) {
  const id = claims?.sub;
  if (typeof id !== "string") {
    return null;
  }

  return {
    email: typeof claims.email === "string" ? claims.email : null,
    id,
  } satisfies AuthenticatedUser;
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

