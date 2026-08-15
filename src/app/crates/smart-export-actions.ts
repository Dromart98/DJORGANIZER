"use server";

import { requireUser } from "@/lib/auth/user";
import { organizationIdSchema } from "@/lib/organization/schemas";
import {
  parseSmartCrateRules,
  resolveAllSmartCrateTrackIds,
} from "@/lib/organization/smart-crates";
import { createClient } from "@/lib/supabase/server";

export async function prepareSmartCrateExportAction(crateId: string) {
  const user = await requireUser();
  const parsedId = organizationIdSchema.safeParse(crateId);
  if (!parsedId.success) {
    return { ok: false as const, message: "El crate no es válido." };
  }

  const supabase = await createClient();
  const { data: crate, error } = await supabase
    .from("crates")
    .select("id, smart_rules")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !crate || crate.smart_rules === null) {
    return {
      ok: false as const,
      message: "No se pudo preparar la exportación del crate inteligente.",
    };
  }

  const parsedRules = parseSmartCrateRules(crate.smart_rules);
  if (!parsedRules.success) {
    return {
      ok: false as const,
      message: "Las reglas guardadas de este crate no son válidas.",
    };
  }

  try {
    const trackIds = await resolveAllSmartCrateTrackIds(
      supabase,
      parsedRules.data,
    );
    return { ok: true as const, trackIds };
  } catch {
    return {
      ok: false as const,
      message: "No se pudo preparar la exportación del crate inteligente.",
    };
  }
}
