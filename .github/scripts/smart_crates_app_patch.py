from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


# Server actions.
actions = Path("src/app/crates/actions.ts")
text = actions.read_text(encoding="utf-8")
text = replace_once(
    text,
    'import { createClient } from "@/lib/supabase/server";\nimport type { Tables } from "@/types/database";',
    '''import {
  parseSmartCrateRulesJson,
  resolveSmartCrateTracks,
  SMART_CRATE_PREVIEW_LIMIT,
  smartCrateRulesToJson,
} from "@/lib/organization/smart-crates";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";''',
    "smart crate action imports",
)
update_anchor = '''export async function deleteCrateAction(formData: FormData) {'''
smart_actions = '''export async function previewSmartCrateAction(serializedRules: string) {
  await requireUser();
  const parsedRules = parseSmartCrateRulesJson(serializedRules);
  if (!parsedRules.success) return { count: 0, tracks: [] };

  try {
    const supabase = await createClient();
    const resolved = await resolveSmartCrateTracks(supabase, parsedRules.data, {
      limit: SMART_CRATE_PREVIEW_LIMIT,
    });
    return {
      count: resolved.count,
      tracks: resolved.tracks.map(({ artist, id, title }) => ({ artist, id, title })),
    };
  } catch {
    return { count: 0, tracks: [] };
  }
}

export async function createSmartCrateAction(formData: FormData) {
  const user = await requireUser();
  const parsed = (() => {
    try {
      return crateValuesFromFormData(formData);
    } catch {
      return null;
    }
  })();
  const parsedRules = parseSmartCrateRulesJson(String(formData.get("smartRules") ?? ""));
  if (!parsed || !parsedRules.success) cratesError("invalid-crate");
  if (!(await validateParentCrate(parsed.parent_id, user.id))) {
    cratesError("invalid-crate");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crates")
    .insert({
      ...parsed,
      smart_rules: smartCrateRulesToJson(parsedRules.data),
      user_id: user.id,
    })
    .select("id")
    .single();

  if (error?.code === "23505") cratesError("duplicate-crate");
  if (error || !data) cratesError("save-crate");

  revalidatePath("/crates");
  redirect(`/crates/${data.id}?created=1`);
}

export async function updateSmartCrateAction(formData: FormData) {
  const user = await requireUser();
  const id = organizationIdSchema.safeParse(formData.get("id"));
  const parsed = (() => {
    try {
      return crateValuesFromFormData(formData);
    } catch {
      return null;
    }
  })();
  const parsedRules = parseSmartCrateRulesJson(String(formData.get("smartRules") ?? ""));
  if (!id.success || !parsed || !parsedRules.success) cratesError("invalid-crate");
  if (!(await validateParentCrate(parsed.parent_id, user.id, id.data))) {
    redirect(`/crates/${id.data}?error=invalid-crate`);
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("crates")
    .select("id, smart_rules")
    .eq("id", id.data)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing || existing.smart_rules === null) {
    redirect(`/crates/${id.data}?error=invalid-crate`);
  }

  const { data, error } = await supabase
    .from("crates")
    .update({
      ...parsed,
      smart_rules: smartCrateRulesToJson(parsedRules.data),
    })
    .eq("id", id.data)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    redirect(`/crates/${id.data}?error=duplicate-crate`);
  }
  if (error || !data) redirect(`/crates/${id.data}?error=save-crate`);

  revalidatePath("/crates");
  revalidatePath(`/crates/${id.data}`);
  redirect(`/crates/${id.data}?updated=1`);
}

'''+update_anchor
text = replace_once(text, update_anchor, smart_actions, "smart crate actions")
text = replace_once(
    text,
    '.from("crates")\n        .select("id")\n        .eq("id", parsed.data.crateId)',
    '.from("crates")\n        .select("id, smart_rules")\n        .eq("id", parsed.data.crateId)',
    "manual add crate select",
)
text = replace_once(
    text,
    '  if (!crate || !track) cratesError("invalid-assignment");',
    '  if (!crate || crate.smart_rules !== null || !track) cratesError("invalid-assignment");',
    "manual add guard",
)
remove_anchor = '''  const supabase = await createClient();
  const { error } = await supabase
    .from("crate_tracks")
    .delete()
    .eq("crate_id", parsed.crateId)'''
remove_new = '''  const supabase = await createClient();
  const { data: crate } = await supabase
    .from("crates")
    .select("id, smart_rules")
    .eq("id", parsed.crateId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!crate || crate.smart_rules !== null) {
    redirect(`/crates/${parsed.crateId}?error=remove-track`);
  }
  const { error } = await supabase
    .from("crate_tracks")
    .delete()
    .eq("crate_id", parsed.crateId)'''
text = replace_once(text, remove_anchor, remove_new, "manual remove guard")
move_anchor = '''  const supabase = await createClient();
  const { data: memberships, error: listError } = await supabase
    .from("crate_tracks")'''
move_new = '''  const supabase = await createClient();
  const { data: crate } = await supabase
    .from("crates")
    .select("id, smart_rules")
    .eq("id", parsed.crateId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!crate || crate.smart_rules !== null) {
    redirect(`/crates/${parsed.crateId}?error=reorder`);
  }
  const { data: memberships, error: listError } = await supabase
    .from("crate_tracks")'''
text = replace_once(text, move_anchor, move_new, "manual move guard")
actions.write_text(text, encoding="utf-8")


# Database types.
types = Path("src/types/database.ts")
text = types.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''          parent_id: string | null;
          updated_at: string;
          user_id: string;''',
    '''          parent_id: string | null;
          smart_rules: Json | null;
          updated_at: string;
          user_id: string;''',
    "crate row smart rules",
)
text = replace_once(
    text,
    '''          parent_id?: string | null;
          updated_at?: string;
          user_id: string;''',
    '''          parent_id?: string | null;
          smart_rules?: Json | null;
          updated_at?: string;
          user_id: string;''',
    "crate insert smart rules",
)
text = replace_once(
    text,
    '''          parent_id?: string | null;
          updated_at?: string;
          user_id?: string;''',
    '''          parent_id?: string | null;
          smart_rules?: Json | null;
          updated_at?: string;
          user_id?: string;''',
    "crate update smart rules",
)
function_anchor = '''      reconcile_crate_tracks: {
        Args: {
          desired_track_ids: string[];
          remove_missing?: boolean;
          target_crate_id: string;
        };
        Returns: Json;
      };'''
function_new = function_anchor + '''
      resolve_smart_crate_rule_tracks: {
        Args: {
          p_limit?: number;
          p_offset?: number;
          p_rules: Json;
          p_search?: string | null;
        };
        Returns: Array<{
          total_count: number;
          track_id: string;
        }>;
      };'''
text = replace_once(text, function_anchor, function_new, "smart crate RPC type")
types.write_text(text, encoding="utf-8")


# Crates index: mark smart crates and provide create form without N+1 count queries.
page = Path("src/app/crates/page.tsx")
text = page.read_text(encoding="utf-8")
text = replace_once(
    text,
    'import { DeleteTagForm } from "@/components/organization/delete-organization-forms";',
    'import { DeleteTagForm } from "@/components/organization/delete-organization-forms";\nimport { SmartCrateForm } from "@/components/organization/smart-crate-form";',
    "smart crate index import",
)
text = replace_once(
    text,
    '''                const count = crateCounts.get(crate.id) ?? 0;
                return (''',
    '''                const count = crateCounts.get(crate.id) ?? 0;
                const smart = crate.smart_rules !== null;
                return (''',
    "smart crate card state",
)
text = replace_once(
    text,
    '''                    <span>
                      {formatTrackCount(locale, count)}
                    </span>''',
    '''                    <span>
                      {smart
                        ? locale === "en"
                          ? "Smart"
                          : "Inteligente"
                        : formatTrackCount(locale, count)}
                    </span>''',
    "smart crate card badge",
)
normal_form_close = '''            </form>
          ) : (
            <Card className="organization-form organization-guidance">'''
normal_form_new = '''            </form>
          ) : (
            <Card className="organization-form organization-guidance">'''
# Keep the existing conditional, then append SmartCrateForm after it.
if normal_form_close not in text:
    raise SystemExit("normal crate form close anchor not found")
# Insert after the full conditional by using the tag card anchor.
tag_anchor = '''
          <div
            className="card organization-form organization-form--tags"
            id="tags"
          >'''
smart_form = '''

          {hasTracks ? (
            <SmartCrateForm
              crates={crateRows.map(({ id, name }) => ({ id, name }))}
              tags={tagRows.map(({ id, name }) => ({ id, name }))}
            />
          ) : null}

          <div
            className="card organization-form organization-form--tags"
            id="tags"
          >'''
text = replace_once(text, tag_anchor, smart_form, "smart create form")
page.write_text(text, encoding="utf-8")


# Crate detail: route smart crates to dynamic detail before manual membership logic.
detail = Path("src/app/crates/[id]/page.tsx")
text = detail.read_text(encoding="utf-8")
text = replace_once(
    text,
    'import { DeleteCrateForm } from "@/components/organization/delete-organization-forms";',
    'import { DeleteCrateForm } from "@/components/organization/delete-organization-forms";\nimport { SmartCrateDetail } from "@/components/organization/smart-crate-detail";',
    "smart detail import",
)
text = replace_once(
    text,
    '''  if (!crate) notFound();
  const totalMemberships = membershipCount ?? 0;''',
    '''  if (!crate) notFound();
  if (crate.smart_rules !== null) {
    return (
      <SmartCrateDetail
        allCrates={allCrates ?? []}
        crate={crate}
        locale={locale}
        requestedPage={requestedPage}
        search={search}
        userId={user.id}
      />
    );
  }
  const totalMemberships = membershipCount ?? 0;''',
    "smart detail routing",
)
detail.write_text(text, encoding="utf-8")

Path(".github/scripts/smart_crates_app_patch.py").unlink()
Path(".github/workflows/temporary-smart-crates-app.yml").unlink()
