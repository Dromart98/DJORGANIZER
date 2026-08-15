from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor missing in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# Smart-crate JSON stays backwards-compatible: missing trackStatus means active.
replace_once(
    "src/lib/organization/smart-crates.ts",
    'export type SmartCrateLogic = "and" | "or";\n',
    'export type SmartCrateLogic = "and" | "or";\n'
    'export type SmartCrateTrackStatus = "active" | "archived" | "all";\n',
)
replace_once(
    "src/lib/organization/smart-crates.ts",
    '  .object({\n    version: z.literal(1),',
    '  .object({\n'
    '    trackStatus: z.enum(["active", "archived", "all"]).optional(),\n'
    '    version: z.literal(1),',
)

# Explicit archived/all selector in smart-crate create/edit UI.
replace_once(
    "src/components/organization/smart-crate-form.tsx",
    '  type SmartCrateRules,\n} from "@/lib/organization/smart-crates";',
    '  type SmartCrateRules,\n'
    '  type SmartCrateTrackStatus,\n'
    '} from "@/lib/organization/smart-crates";',
)
replace_once(
    "src/components/organization/smart-crate-form.tsx",
    '  const { locale } = useTranslator();\n'
    '  const [logic, setLogic] = useState<SmartCrateLogic>(initialRules?.logic ?? "and");',
    '  const { locale } = useTranslator();\n'
    '  const [trackStatus, setTrackStatus] = useState<SmartCrateTrackStatus>(\n'
    '    initialRules?.trackStatus ?? "active",\n'
    '  );\n'
    '  const [logic, setLogic] = useState<SmartCrateLogic>(initialRules?.logic ?? "and");',
)
replace_once(
    "src/components/organization/smart-crate-form.tsx",
    '  const rules = useMemo<SmartCrateRules>(() => ({\n    version: 1,',
    '  const rules = useMemo<SmartCrateRules>(() => ({\n'
    '    trackStatus,\n'
    '    version: 1,',
)
replace_once(
    "src/components/organization/smart-crate-form.tsx",
    '  }), [groups, logic]);',
    '  }), [groups, logic, trackStatus]);',
)
replace_once(
    "src/components/organization/smart-crate-form.tsx",
    '    none: "None",\n    groups: "Combine groups",',
    '    none: "None",\n'
    '    trackStatus: "Tracks",\n'
    '    activeTracks: "Active only",\n'
    '    archivedTracks: "Archived only",\n'
    '    allTracks: "Active and archived",\n'
    '    groups: "Combine groups",',
)
replace_once(
    "src/components/organization/smart-crate-form.tsx",
    '    none: "Ninguna",\n    groups: "Combinar grupos",',
    '    none: "Ninguna",\n'
    '    trackStatus: "Pistas",\n'
    '    activeTracks: "Solo activas",\n'
    '    archivedTracks: "Solo archivadas",\n'
    '    allTracks: "Activas y archivadas",\n'
    '    groups: "Combinar grupos",',
)
replace_once(
    "src/components/organization/smart-crate-form.tsx",
    '''      <label className="field">\n        {text.groups}\n        <select value={logic} onChange={(event) => { setLogic(event.target.value as SmartCrateLogic); setPreview(null); }}>\n''',
    '''      <label className="field">\n        {text.trackStatus}\n        <select\n          value={trackStatus}\n          onChange={(event) => {\n            setTrackStatus(event.target.value as SmartCrateTrackStatus);\n            setPreview(null);\n          }}\n        >\n          <option value="active">{text.activeTracks}</option>\n          <option value="archived">{text.archivedTracks}</option>\n          <option value="all">{text.allTracks}</option>\n        </select>\n      </label>\n      <label className="field">\n        {text.groups}\n        <select value={logic} onChange={(event) => { setLogic(event.target.value as SmartCrateLogic); setPreview(null); }}>\n''',
)

# Type-level regression for optional explicit archived modes.
replace_once(
    "src/lib/organization/smart-crates.test.ts",
    '  it("accepts tag conditions using persistent tag ids", () => {',
    '''  it("accepts explicit archived modes while legacy rules stay valid", () => {\n    expect(parseSmartCrateRules(rules).success).toBe(true);\n    const archived = parseSmartCrateRules({ ...rules, trackStatus: "archived" });\n    expect(archived.success).toBe(true);\n    if (archived.success) expect(archived.data.trackStatus).toBe("archived");\n    expect(parseSmartCrateRules({ ...rules, trackStatus: "invalid" }).success).toBe(false);\n  });\n\n  it("accepts tag conditions using persistent tag ids", () => {''',
)

# DB resolver: active by default, archived/all only by explicit filter.
migration_path = Path("supabase/migrations/20260815143000_archive_inactive_tracks.sql")
migration = migration_path.read_text(encoding="utf-8")
old_predicate = """    where t.user_id = (select auth.uid())
      and t.archived_at is null
      and jsonb_typeof(p_rules) = 'object'"""
new_predicate = """    where t.user_id = (select auth.uid())
      and case coalesce(p_rules ->> 'trackStatus', 'active')
        when 'active' then t.archived_at is null
        when 'archived' then t.archived_at is not null
        when 'all' then true
        else false
      end
      and jsonb_typeof(p_rules) = 'object'"""
if old_predicate not in migration:
    raise SystemExit("smart resolver archive predicate missing")
migration = migration.replace(old_predicate, new_predicate, 1)

# The server-side active-filter crate creation must not silently re-include archived rows.
filtered_rpc = Path(
    "supabase/migrations/20260814154500_create_filtered_crate_rpc.sql"
).read_text(encoding="utf-8")
old_filtered = "    where tracks.user_id = current_user_id\n      and ("
if old_filtered not in filtered_rpc:
    raise SystemExit("filtered crate predicate missing")
filtered_rpc = filtered_rpc.replace(
    old_filtered,
    "    where tracks.user_id = current_user_id\n"
    "      and tracks.archived_at is null\n"
    "      and (",
    1,
)
migration_path.write_text(
    migration.rstrip() + "\n\n" + filtered_rpc.strip() + "\n",
    encoding="utf-8",
)

# pgTAP: default active-only plus explicit archived opt-in.
pg_path = Path("supabase/tests/database/smart_crates.test.sql")
pg = pg_path.read_text(encoding="utf-8")
if "select plan(9);" not in pg:
    raise SystemExit("expected smart-crate plan(9)")
pg = pg.replace("select plan(9);", "select plan(10);", 1)
default_assert = '''select is(\n  (\n    select count(*)::integer\n    from public.resolve_smart_crate_rule_tracks(\n      '{"version":1,"logic":"and","groups":[{"logic":"and","conditions":[{"field":"genre","operator":"equals","value":"Techno"}]}]}'::jsonb,\n      0, 100, null\n    )\n  ),\n  0,\n  'Archived tracks are excluded from smart crates by default'\n);'''
explicit_assert = default_assert + '''\n\nselect is(\n  (\n    select count(*)::integer\n    from public.resolve_smart_crate_rule_tracks(\n      '{"version":1,"trackStatus":"archived","logic":"and","groups":[{"logic":"and","conditions":[{"field":"genre","operator":"equals","value":"Techno"}]}]}'::jsonb,\n      0, 100, null\n    )\n  ),\n  1,\n  'Archived tracks enter smart crates only through an explicit filter'\n);'''
if default_assert not in pg:
    raise SystemExit("default archived smart-crate assertion missing")
pg_path.write_text(pg.replace(default_assert, explicit_assert, 1), encoding="utf-8")

# Authenticated browser regression: archive -> hidden -> archived filter -> restore.
Path("tests/e2e/authenticated-library-archive.spec.ts").write_text(
    '''import { expect, test } from "@playwright/test";\n\ntest.skip(\n  process.env.E2E_AUTHENTICATED !== "1",\n  "Requires the ephemeral Supabase stack configured by CI.",\n);\n\ntest("@authenticated archives and restores a library track", async ({ page }, testInfo) => {\n  const runId = `${Date.now()}-${testInfo.workerIndex}`;\n  const email = `e2e-archive-${runId}@djorganizer.test`;\n  const password = `DjOrganizer-${runId}!`;\n  const title = `Archive ${runId}`;\n\n  await page.context().addCookies([{\n    name: "djorganizer-locale",\n    url: "http://127.0.0.1:3100",\n    value: "en",\n  }]);\n  await page.goto("/signup?next=/library/new");\n  await page.getByLabel("Name").fill("Archive E2E");\n  await page.getByLabel("Email").fill(email);\n  await page.getByLabel("Password").fill(password);\n  await page.getByRole("button", { name: "Create account" }).click();\n  await expect(page).toHaveURL(/\\/library\\/new$/, { timeout: 20_000 });\n\n  await page.getByLabel("Title *").fill(title);\n  await page.getByRole("button", { name: "Add track" }).click();\n  await expect(page).toHaveURL(/\\/library\\/[0-9a-f-]+$/, { timeout: 20_000 });\n\n  await page.goto("/library");\n  let row = page.locator("tbody tr").filter({ hasText: title });\n  await expect(row).toHaveCount(1);\n  await row.getByRole("button", { name: "Archive" }).click();\n  await expect(page.locator("tbody tr").filter({ hasText: title })).toHaveCount(0, { timeout: 20_000 });\n\n  await page.getByLabel("Status").selectOption("archived");\n  await page.getByRole("button", { name: "Apply" }).click();\n  await expect(page).toHaveURL(/status=archived/);\n  row = page.locator("tbody tr").filter({ hasText: title });\n  await expect(row).toHaveCount(1);\n  await row.getByRole("button", { name: "Restore" }).click();\n  await expect(page.locator("tbody tr").filter({ hasText: title })).toHaveCount(0, { timeout: 20_000 });\n\n  await page.goto("/library");\n  await expect(page.locator("tbody tr").filter({ hasText: title })).toHaveCount(1);\n});\n''',
    encoding="utf-8",
)

replace_once(
    "docs/roadmap.md",
    "5. - [ ] Permitir archivar pistas inactivas sin borrar ni mover el archivo.",
    "5. - [x] Permitir archivar pistas inactivas sin borrar ni mover el archivo.",
)
