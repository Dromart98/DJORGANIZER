import { expect, test } from "@playwright/test";

test.skip(
  process.env.E2E_AUTHENTICATED !== "1",
  "Requires the ephemeral Supabase stack configured by CI.",
);

function createTestWav(frequency: number) {
  const sampleRate = 8_000;
  const sampleCount = sampleRate / 2;
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * bytesPerSample, 28);
  wav.writeUInt16LE(bytesPerSample, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.min(1, index / 200, (sampleCount - index) / 200);
    const sample =
      Math.sin((2 * Math.PI * frequency * index) / sampleRate) *
      envelope *
      4_000;
    wav.writeInt16LE(Math.round(sample), 44 + index * bytesPerSample);
  }

  return wav;
}

test("@authenticated imports tracks without artists and builds an ordered crate", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    class LocalGenreWorkerStub extends EventTarget {
      private analyzeCount = 0;

      postMessage(message: unknown) {
        const request = message as { id: string; type: string };
        const mode = window.localStorage.getItem("e2e-local-genre-mode") ?? "ready";
        if (request.type === "prepare") {
          window.setTimeout(() => {
            this.dispatchEvent(
              new MessageEvent("message", {
                data:
                  mode === "prepare-error"
                    ? {
                        error: "No compatible backend.",
                        id: request.id,
                        type: "error",
                      }
                    : {
                        backend: "wasm",
                        id: request.id,
                        status: "ready",
                        type: "status",
                      },
              }),
            );
          }, 750);
          return;
        }
        this.analyzeCount += 1;
        if (
          mode === "hang" ||
          ((mode === "hang-second" || mode === "long-first-hang-second") &&
            this.analyzeCount === 2)
        ) {
          return;
        }
        queueMicrotask(() => {
          this.dispatchEvent(
            new MessageEvent("message", {
              data:
                mode === "error"
                  ? {
                      error: "Local analysis failed for test.",
                      id: request.id,
                      type: "error",
                    }
                  : {
                      id: request.id,
                      suggestion: {
                        alternatives: mode === "long-first-hang-second"
                          ? [
                              {
                                genre:
                                  "Electronic dance music with an intentionally long classification label",
                                score: 0.64,
                                subgenre:
                                  "Deep progressive melodic house and techno with atmospheric elements",
                              },
                              {
                                genre:
                                  "Independent alternative electronic music and experimental club sounds",
                                score: 0.53,
                                subgenre:
                                  "Organic downtempo electronica with live instrumentation and vocals",
                              },
                              {
                                genre: "Electronic",
                                score: 0.41,
                                subgenre:
                                  "Peak-time driving hypnotic warehouse techno",
                              },
                            ]
                          : [
                              {
                                genre: "Electronic",
                                score: 0.64,
                                subgenre: "House",
                              },
                              {
                                genre: "Electronic",
                                score: 0.53,
                                subgenre: "Tech House",
                              },
                            ],
                        backend: "wasm",
                        genre: "Electronic",
                        score: 0.82,
                        subgenre: "Techno",
                      },
                      type: "result",
                    },
            }),
          );
        });
      }

      terminate() {}
    }
    const WorkerProxy = function (
      this: Worker,
      url: string | URL,
      options?: WorkerOptions,
    ) {
      return options?.name === "djorganizer-local-genre" ||
        String(url).includes("local-genre.worker")
        ? (new LocalGenreWorkerStub() as unknown as Worker)
        : new NativeWorker(url, options);
    } as unknown as typeof Worker;
    Object.defineProperty(window, "Worker", {
      configurable: true,
      value: WorkerProxy,
    });
  });
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const firstTitle = `E2E Warmup ${runId}`;
  const secondTitle = `E2E Peak ${runId}`;
  const crateName = `E2E Set ${runId}`;
  const childCrateName = `E2E Child ${runId}`;
  const tagName = `E2E Peak tag ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);
  await page.goto("/signup?next=/import");
  await page.getByLabel("Name").fill("DJ E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/import$/, { timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: "Import music" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Preparing analysis…")).toBeVisible();
  await expect(page.getByText("Analysis ready")).toBeVisible();
  await expect(page.getByRole("button", { name: /download/i })).toHaveCount(0);

  await page.evaluate(() =>
    window.localStorage.setItem("e2e-local-genre-mode", "prepare-error"),
  );
  await page.reload();
  await expect(
    page.getByText(/Analysis unavailable.*The analysis could not be prepared/),
  ).toBeVisible();
  await page.evaluate(() =>
    window.localStorage.setItem("e2e-local-genre-mode", "ready"),
  );
  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "es",
    },
  ]);
  await page.reload();
  await expect(page.getByText("Análisis preparado")).toBeVisible();
  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);

  await page.goto("/");
  const gettingStarted = page.locator(".getting-started");
  await expect(
    gettingStarted.getByRole("heading", {
      name: "Prepare your first set",
    }),
  ).toBeVisible();
  await expect(
    gettingStarted.getByText("0 of 3 steps completed"),
  ).toBeVisible();
  await expect(
    gettingStarted.getByRole("link", { name: /select your first tracks/i }),
  ).toHaveClass(/button--primary/);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "Your library is empty" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Import music" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add a track manually" }),
  ).toBeVisible();

  await page.goto("/crates");
  await expect(
    page.getByRole("heading", {
      name: "There is no music for a crate yet",
    }),
  ).toBeVisible();
  await expect(
    page
      .locator("form.organization-form")
      .filter({ has: page.getByRole("heading", { name: "Create crate" }) }),
  ).toHaveCount(0);

  await page.goto("/");
  const keyboardImportLink = page.getByRole("link", {
    name: /select your first tracks/i,
  });
  await keyboardImportLink.focus();
  await expect(keyboardImportLink).toBeFocused();
  await keyboardImportLink.press("Enter");
  await expect(page).toHaveURL(/\/import$/);
  await expect(
    page.getByRole("heading", { name: "Choose how to select your music" }),
  ).toBeVisible();
  await expect(page.getByText("Files from the browser")).toBeVisible();
  await expect(
    page.getByText("Folder in the desktop app", { exact: true }),
  ).toBeVisible();

  await page.evaluate(() =>
    window.localStorage.setItem(
      "e2e-local-genre-mode",
      "long-first-hang-second",
    ),
  );
  await page.locator("#audio-files").setInputFiles([
    {
      buffer: createTestWav(220),
      mimeType: "audio/wav",
      name: `${firstTitle}.wav`,
    },
    {
      buffer: createTestWav(330),
      mimeType: "audio/wav",
      name: `${secondTitle}.wav`,
    },
  ]);

  const firstItem = page
    .locator("article.import-item")
    .filter({ hasText: `${firstTitle}.wav` });
  const secondItem = page
    .locator("article.import-item")
    .filter({ hasText: `${secondTitle}.wav` });
  await expect(firstItem).toBeVisible({ timeout: 20_000 });
  await expect(secondItem).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: "Suggest genre locally" }),
  ).toHaveCount(0);

  await expect(
    firstItem.getByText(/Genre: Electronic · Subgenre: Techno/),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    firstItem.getByText("Calculated result", { exact: true }),
  ).toBeVisible();
  await expect(
    firstItem.getByText(
      /Alternatives: Electronic dance music with an intentionally long classification label/,
    ),
  ).toBeVisible();

  const assertSuggestionLayoutIsStable = async (
    viewport: { height: number; width: number },
  ) => {
    await page.setViewportSize(viewport);
    const measurements = await firstItem.evaluate((item) => {
      const suggestion = item.querySelector<HTMLElement>(".genre-suggestion");
      if (!suggestion) throw new Error("Genre suggestion is not rendered");
      const inputs = Array.from(
        item.querySelectorAll<HTMLInputElement>(".import-grid input"),
      );
      const measureInputs = () =>
        inputs.map((input) => {
          const box = input.getBoundingClientRect();
          return { height: box.height, width: box.width };
        });
      const after = measureInputs();
      suggestion.style.display = "none";
      const before = measureInputs();
      suggestion.style.removeProperty("display");
      return {
        after,
        before,
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        itemOverflow: item.scrollWidth - item.clientWidth,
      };
    });

    expect(measurements.after).toEqual(measurements.before);
    expect(measurements.documentOverflow).toBeLessThanOrEqual(0);
    expect(measurements.itemOverflow).toBeLessThanOrEqual(0);
  };

  for (const viewport of [
    { height: 900, width: 1440 },
    { height: 900, width: 980 },
    { height: 800, width: 640 },
    { height: 800, width: 390 },
  ]) {
    await assertSuggestionLayoutIsStable(viewport);
  }
  await page.setViewportSize({ height: 720, width: 1280 });

  await expect(secondItem.getByRole("button", { name: "Cancel" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Save 2 tracks" })).toBeDisabled();
  await secondItem.getByRole("button", { name: "Cancel" }).click();
  await expect(secondItem.getByText("Analysis cancelled.")).toBeVisible();
  await expect(
    secondItem.getByRole("button", {
      name: "Retry genre and subgenre analysis",
    }),
  ).toBeVisible();

  await page.evaluate(() =>
    window.localStorage.setItem("e2e-local-genre-mode", "ready"),
  );
  await expect(page.getByText("Analysis ready")).toBeVisible();
  await secondItem
    .getByRole("button", { name: "Retry genre and subgenre analysis" })
    .click();
  await expect(
    secondItem.getByText(/Genre: Electronic · Subgenre: Techno/),
  ).toBeVisible({ timeout: 30_000 });

  await firstItem.getByRole("button", { name: "Accept suggestion" }).click();
  await expect(firstItem.getByLabel("Genre", { exact: true })).toHaveValue(
    "Electronic",
  );
  await expect(firstItem.getByLabel("Subgenre", { exact: true })).toHaveValue(
    "Techno",
  );
  await secondItem.getByRole("button", { name: "Reject" }).click();
  await expect(
    secondItem.getByText(/Genre: Electronic · Subgenre: Techno/),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry genre and subgenre analysis" }),
  ).toHaveCount(0);
  await expect(secondItem.getByLabel("Genre", { exact: true })).toBeEnabled();

  const fillReviewedAnalysis = async (
    item: ReturnType<typeof page.locator>,
    bpm: string,
    musicalKey: string,
  ) => {
    const bpmInput = item.locator("label.import-bpm-field input");
    const keyInput = item.locator("label.import-key-field input");
    await expect(bpmInput).toBeEnabled({ timeout: 30_000 });
    await expect(keyInput).toBeEnabled({ timeout: 30_000 });
    await bpmInput.fill(bpm);
    await keyInput.fill(musicalKey);
    await expect(item.getByLabel("Artist (optional)")).toHaveValue("");
  };

  await fillReviewedAnalysis(firstItem, "120", "Am");
  await fillReviewedAnalysis(secondItem, "128", "C");

  await page.getByRole("button", { name: "Save 2 tracks" }).click();
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(2, {
    timeout: 20_000,
  });

  await page.goto("/");
  await expect(
    page.locator(".getting-started").getByText("2 of 3 steps completed"),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /create the first crate/i }),
  ).toHaveClass(/button--primary/);

  await page.goto(`/library?q=${encodeURIComponent(`missing-${runId}`)}`);
  await expect(
    page.getByRole("heading", {
      name: "No results for these filters",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your library is empty" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("heading", { name: "Library" }),
  ).toBeVisible();
  const libraryTable = page.locator("tbody");
  await expect(
    libraryTable.getByText(firstTitle, { exact: true }),
  ).toBeVisible();
  await expect(
    libraryTable.getByText(secondTitle, { exact: true }),
  ).toBeVisible();
  await expect(
    libraryTable.getByText("Unknown artist", { exact: true }),
  ).toHaveCount(2);

  await page.goto("/crates");
  await expect(
    page.getByRole("heading", { name: "Create your first crate" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "A crate is an ordered list of references to your tracks.",
      { exact: false },
    ),
  ).toBeVisible();
  const createTagForm = page.locator("form.tag-create-form");
  await createTagForm.getByLabel("Name").fill(tagName);
  await createTagForm.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page).toHaveURL(/tagCreated=1$/, { timeout: 20_000 });
  await expect(page.locator(".tag-list").getByText(tagName, { exact: true })).toBeVisible();

  await page.goto("/library");
  await page.getByRole("checkbox", { name: `Select ${firstTitle}` }).check();
  await page.getByRole("checkbox", { name: `Select ${secondTitle}` }).check();
  await page.getByLabel("Tag for selection").selectOption({ label: tagName });
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/tagged=1$/, { timeout: 20_000 });
  for (const title of [firstTitle, secondTitle]) {
    await expect(page.locator("tbody tr").filter({ hasText: title }).getByText(tagName)).toBeVisible();
  }
  await page.reload();
  await expect(page.locator("tbody tr").filter({ hasText: firstTitle }).getByText(tagName)).toBeVisible();
  await page.goto(`/library?q=${encodeURIComponent(firstTitle)}`);
  await expect(page.locator("tbody tr").filter({ hasText: firstTitle }).getByText(tagName)).toBeVisible();
  const desktopTable = page.locator(".library-table table");
  expect(await desktopTable.locator("thead th").count()).toBe(
    await desktopTable.locator("tbody tr").first().locator("td").count(),
  );
  await expect(desktopTable.getByRole("columnheader", { name: /Subgenre/ })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 780 });
  const firstMobileCard = page.locator(".mobile-track").filter({ hasText: firstTitle });
  await expect(firstMobileCard.getByText(tagName)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await firstMobileCard.getByRole("link", { name: `Edit: ${firstTitle}` }).focus();
  await expect(firstMobileCard.getByRole("link", { name: `Edit: ${firstTitle}` })).toBeFocused();
  await firstMobileCard.getByRole("link", { name: `Edit: ${firstTitle}` }).press("Enter");
  await expect(page.getByRole("heading", { name: firstTitle })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tags" })).toBeVisible();
  await expect(page.getByText(tagName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Remove tag ${tagName} from ${firstTitle}` }).click();
  await expect(page).toHaveURL(/untagged=1$/, { timeout: 20_000 });
  await expect(page.getByRole("status")).toContainText("The tag was removed from the selection.");
  await expect(page.getByText(tagName, { exact: true })).toHaveCount(1);
  const trackTagsPanel = page.locator(".track-tags-panel");
  await trackTagsPanel.getByLabel("Assign tag").selectOption({ label: tagName });
  await trackTagsPanel.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page).toHaveURL(/tagged=1$/, { timeout: 20_000 });
  await expect(page.getByRole("status")).toContainText("The tag was assigned to the selection.");
  await page.getByRole("button", { name: `Remove tag ${tagName} from ${firstTitle}` }).click();
  await expect(page).toHaveURL(/untagged=1$/, { timeout: 20_000 });
  await expect(page.getByRole("status")).toContainText("The tag was removed from the selection.");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/library");
  await expect(page.locator("tbody tr").filter({ hasText: firstTitle }).getByText(tagName)).toHaveCount(0);
  await expect(page.locator("tbody tr").filter({ hasText: secondTitle }).getByText(tagName)).toBeVisible();
  await page.goto("/crates");
  await expect(page.locator(".tag-list").getByText(tagName, { exact: true })).toBeVisible();
  const createCrateForm = page
    .locator("form.organization-form")
    .filter({ has: page.getByRole("heading", { name: "Create crate" }) });
  await createCrateForm.getByLabel("Name").fill(crateName);
  await createCrateForm
    .getByLabel("Description")
    .fill("Authenticated end-to-end progression");
  await expect(createCrateForm.getByLabel("Save inside")).toHaveValue("");
  await expect(createCrateForm.getByLabel("Save inside")).toContainText("None");
  await expect(
    createCrateForm.getByText(
      "Select another crate to place this crate inside it.",
    ),
  ).toBeVisible();
  await createCrateForm.getByRole("button", { name: "Create crate" }).click();

  await expect(page).toHaveURL(/\/crates\/[0-9a-f-]+\?created=1$/, {
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: crateName })).toBeVisible();
  const crateUrl = page.url();

  await page.goto("/crates");
  await createCrateForm.getByLabel("Name").fill(childCrateName);
  await createCrateForm
    .getByLabel("Save inside")
    .selectOption({ label: crateName });
  await createCrateForm.getByRole("button", { name: "Create crate" }).click();
  await expect(page.getByRole("heading", { name: childCrateName })).toBeVisible();
  const editCrateForm = page
    .locator("form.organization-form")
    .filter({ has: page.getByRole("heading", { name: "Edit crate" }) });
  await expect(editCrateForm.getByLabel("Save inside")).toHaveValue(/.+/);
  await expect(editCrateForm.getByLabel("Save inside")).toContainText(crateName);
  await page.goto("/crates");
  const childCrateCard = page
    .locator(".crate-card")
    .filter({ hasText: childCrateName });
  await expect(childCrateCard).toContainText(`Inside ${crateName}`);
  await childCrateCard.click();
  await editCrateForm.getByLabel("Save inside").selectOption("");
  await editCrateForm.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/updated=1$/, { timeout: 20_000 });
  await expect(editCrateForm.getByLabel("Save inside")).toHaveValue("");

  await page.goto("/");
  await expect(page.locator(".getting-started")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Prepare your next set" }),
  ).toBeVisible();

  await page.goto("/?__e2eError=1");
  const recoveryAlert = page.getByRole("alert", {
    name: "The screen could not be loaded",
  });
  await expect(
    recoveryAlert.getByRole("heading", {
      name: "The screen could not be loaded",
    }),
  ).toBeVisible();
  await expect(
    recoveryAlert.getByText("Controlled route failure", { exact: false }),
  ).toHaveCount(0);
  await expect(
    recoveryAlert.getByRole("button", { name: "Retry" }),
  ).toBeVisible();
  await expect(
    recoveryAlert.getByRole("link", { name: "Go to Library" }),
  ).toBeVisible();
  await expect(recoveryAlert.getByRole("heading")).toBeFocused();
  await recoveryAlert.getByRole("button", { name: "Retry" }).click();
  await expect(recoveryAlert).toBeVisible();
  await recoveryAlert
    .getByRole("link", { name: "Go to Library" })
    .click();
  await expect(page).toHaveURL(/\/library$/);

  await page.goto(crateUrl);

  const addTrack = async (title: string) => {
    const candidate = page
      .locator(".available-track-list li")
      .filter({ hasText: title });
    await expect(candidate).toBeVisible();
    await candidate.getByRole("button", { name: "Add" }).click();
    await expect(page).toHaveURL(/trackAdded=1$/, { timeout: 20_000 });
    await expect(candidate).toHaveCount(0);
  };

  await addTrack(firstTitle);
  await addTrack(secondTitle);

  const orderedTitles = page.locator(".crate-track-list > li");
  await expect(orderedTitles).toHaveCount(2);
  await expect(orderedTitles.nth(0)).toContainText(firstTitle);
  await expect(orderedTitles.nth(1)).toContainText(secondTitle);

  await page
    .getByRole("button", { name: `Move ${secondTitle} up` })
    .click();
  await expect(orderedTitles.nth(0)).toContainText(secondTitle);
  await expect(orderedTitles.nth(1)).toContainText(firstTitle);

  await page.goto("/settings?source=e2e");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Private diagnostics" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Desktop updates" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export diagnostics" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check for updates" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Connected account" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Library mode" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Language / Idioma" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Backups" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "DJ integrations" })).toHaveCount(0);
  await expect(page.getByText("Stable contracts", { exact: true })).toHaveCount(0);
  for (const provider of ["VirtualDJ", "Rekordbox", "Serato", "Traktor"]) {
    await expect(page.getByText(provider, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByLabel("Language", { exact: false }).selectOption("es");
  await expect(page).toHaveURL(/\/settings\?source=e2e$/);
  await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Diagnóstico privado" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Actualizaciones de escritorio" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Exportar diagnóstico" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buscar actualizaciones" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Cuenta conectada" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Modo de biblioteca" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Idioma / Language" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Copias de seguridad" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Integraciones DJ" })).toHaveCount(0);
  await expect(page.getByText("Contratos estables", { exact: true })).toHaveCount(0);
  for (const provider of ["VirtualDJ", "Rekordbox", "Serato", "Traktor"]) {
    await expect(page.getByText(provider, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
  await page.getByLabel("Idioma", { exact: false }).selectOption("en");
  await expect(page).toHaveURL(/\/settings\?source=e2e$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  await page.goto(crateUrl);
  await orderedTitles
    .filter({ hasText: firstTitle })
    .getByRole("link", { name: firstTitle })
    .click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]+$/, {
    timeout: 20_000,
  });
  await expect(
    page.getByRole("heading", { name: firstTitle }),
  ).toBeVisible({ timeout: 20_000 });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete track" }).click();

  await expect(page).toHaveURL(/\/library\?deleted=1$/, {
    timeout: 20_000,
  });
  await expect(
    page.getByText("The selection was deleted successfully."),
  ).toBeVisible();
  await expect(
    page.locator("tbody").getByText(firstTitle, { exact: true }),
  ).toHaveCount(0);
});
