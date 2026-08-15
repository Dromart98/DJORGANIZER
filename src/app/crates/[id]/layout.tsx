import type { ReactNode } from "react";
import { ManualCrateHistory } from "@/components/organization/manual-crate-history";
import { requireUser } from "@/lib/auth/user";
import { getCurrentLocale } from "@/lib/i18n/server";
import { listManualCrateHistory } from "@/lib/organization/manual-crate-history";
import { organizationIdSchema } from "@/lib/organization/schemas";
import { createClient } from "@/lib/supabase/server";

export default async function CrateLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parsedId = organizationIdSchema.safeParse(id);
  if (!parsedId.success) return children;

  const [user, locale] = await Promise.all([requireUser(), getCurrentLocale()]);
  const supabase = await createClient();
  const { data: crate, error } = await supabase
    .from("crates")
    .select("id, smart_rules")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !crate || crate.smart_rules !== null) return children;

  const history = await listManualCrateHistory(supabase, crate.id, 10);

  return (
    <>
      {children}
      <ManualCrateHistory crateId={crate.id} entries={history} locale={locale} />
    </>
  );
}
