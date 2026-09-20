import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

test.skip(process.env.E2E_AUTHENTICATED !== "1", "Requires the ephemeral Supabase stack configured by CI.");

test("@authenticated applies reviewed MAEST proposals and undoes their history batch", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const run = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `maest-history-${run}@djorganizer.test`;
  const password = `DjOrganizer-${run}!`;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signup = await db.auth.signUp({ email, password });
  expect(signup.error).toBeNull();
  expect(signup.data.session).not.toBeNull();
  const inserted = await db.from("tracks").insert([0, 1].map((i) => ({
    user_id: signup.data.user!.id, title: `MAEST History ${i} ${run}`,
    genre: i === 0 ? "House" : null, subgenre: i === 0 ? "Deep House" : null,
    genre_source: i === 0 ? "manual" : null, subgenre_source: i === 0 ? "manual" : null,
    file_fingerprint: String(i + 1).repeat(64), file_size: 1024,
  }))).select("*").order("title");
  expect(inserted.error).toBeNull();
  const tracks = inserted.data!;

  // Only the native device boundary is deterministic here. Authentication,
  // server action, PostgreSQL persistence, history listing and undo are real.
  // Native model inference is covered separately by desktop tests.
  await page.addInitScript(({ tracks }) => {
    const calls: string[] = [];
    Object.assign(window, {
      __maestHistoryCalls: calls,
      __TAURI__: { core: { invoke: async (command: string, args?: Record<string, unknown>) => {
        calls.push(command);
        if (command === "choose_and_scan_music_folder") return {
          sessionId: "history-session", rootName: "History fixtures", examinedEntries: 2,
          skippedEntries: 0, metadataFailures: 0, duplicateGroups: 0, duplicateTracks: 0,
          fingerprintFailures: 0, truncated: false,
          tracks: tracks.map((track, i) => ({
            scanId: `scan-${i}`, name: `${i}.mp3`, relativePath: `${i}.mp3`, extension: "mp3",
            sizeBytes: 1024, metadataRead: true, title: track.title, artist: null, album: null,
            genre: track.genre, durationSeconds: 60, bpm: null, musicalKey: null, duplicateGroup: null,
          })),
        };
        if (command === "link_library_tracks") return {
          fingerprintFailures: 0, linkedTracks: 2, unmatchedTracks: 0,
          links: tracks.map((track, i) => ({ trackId: track.id, scanId: `scan-${i}` })),
        };
        if (["prepare_maest_model", "begin_maest_analysis", "release_maest_analysis", "get_maest_analysis_progress"].includes(command)) return null;
        if (command === "analyze_scanned_track") {
          const request = args!.request as { scanId: string };
          return { scanId: request.scanId, analysis: {
            analyzer: { id: "djorganizer.desktop.genre.maest", version: "discogs-maest-30s-pw-519l@2" },
            compatibilityKey: "maest-519l|mel-16000-1876x96-f32|windows-start-center-end-mean|v3",
            genre: { field: "genre", status: "completed", source: "automatic", proposedValue: "Disco", score: 0.8, analyzedAt: "123456789" },
            subgenre: { field: "subgenre", status: "completed", source: "automatic", proposedValue: "Nu Disco", score: 0.7, analyzedAt: "123456789" },
            partialErrors: [],
          } };
        }
        throw new Error(`Unexpected native command: ${command}`);
      } } },
    });
  }, { tracks });
  await page.context().addCookies([{ name: "djorganizer-locale", url: "http://127.0.0.1:3100", value: "en" }]);
  await page.goto("/login?next=/import");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/import$/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Select folder", exact: true }).click();
  await expect(page.getByText(/2 library tracks linked to this device/)).toBeVisible({ timeout: 20_000 });
  // Client navigation preserves the native scan session provider.
  await page.getByRole("link", { name: "Library", exact: true }).first().click();
  await expect(page).toHaveURL(/\/library$/);
  for (const track of tracks) await page.getByRole("checkbox", { name: `Select ${track.title}`, exact: true }).check();
  await page.getByRole("button", { name: "Analyze genre and subgenre", exact: true }).click();
  const panel = page.getByRole("region", { name: "Batch genre and subgenre analysis" });
  for (const track of tracks) {
    const item = panel.locator("li").filter({ has: page.getByText(track.title, { exact: true }) });
    await expect(item.getByText("Completed", { exact: true })).toBeVisible();
    await item.getByRole("checkbox", { name: /^Apply genre:/ }).check();
  }
  // First track applies both fields; second applies genre alone.
  await panel.locator("li").filter({ hasText: tracks[0].title }).getByRole("checkbox", { name: /^Apply subgenre:/ }).check();
  const beforeApply = await db.from("tracks").select("genre, subgenre").order("title");
  expect(beforeApply.error).toBeNull();
  expect(beforeApply.data).toEqual([{ genre: "House", subgenre: "Deep House" }, { genre: null, subgenre: null }]);
  page.once("dialog", (dialog) => void dialog.accept());
  await panel.getByRole("button", { name: "Apply selected proposals", exact: true }).click();
  const history = page.getByRole("region", { name: "Recent bulk edits" });
  await expect(history.getByText("2 tracks · Multiple fields", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(history.getByText("Previous values: saved values for each changed field", { exact: true })).toBeVisible();
  const applied = await db.from("tracks").select("genre, subgenre").order("title");
  expect(applied.error).toBeNull();
  expect(applied.data).toEqual([{ genre: "Disco", subgenre: "Nu Disco" }, { genre: "Disco", subgenre: null }]);
  const calls = await page.evaluate(() => (window as Window & { __maestHistoryCalls: string[] }).__maestHistoryCalls);
  expect(calls.filter((command) => command === "analyze_scanned_track")).toHaveLength(2);
  expect(calls.some((command) => /write|export|reorganize/.test(command))).toBe(false);
  page.once("dialog", (dialog) => void dialog.accept());
  await history.getByRole("button", { name: "Undo batch", exact: true }).click();
  await expect(page).toHaveURL(/bulkUndone=1/, { timeout: 20_000 });
  await expect(history.getByText("Already undone", { exact: true })).toBeVisible();
  const restored = await db.from("tracks").select("*").order("title");
  expect(restored.error).toBeNull();
  const withoutUpdatedAt = (rows: Record<string, unknown>[]) => rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "updated_at")));
  expect(withoutUpdatedAt(restored.data!)).toEqual(withoutUpdatedAt(tracks));
  for (const track of tracks) {
    await page.getByRole("row").filter({ hasText: track.title }).getByRole("link", { name: /View|Edit/ }).first().click();
    await expect(page.getByLabel("Genre", { exact: true })).toHaveValue(track.genre ?? "");
    await expect(page.getByLabel("Subgenre", { exact: true })).toHaveValue(track.subgenre ?? "");
    await page.getByRole("link", { name: "Library", exact: true }).first().click();
  }
});

