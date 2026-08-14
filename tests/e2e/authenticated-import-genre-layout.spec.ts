import { expect, test, type Locator, type Page } from "@playwright/test";

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

type InputMeasurement = {
  height: number;
  width: number;
};

async function measureInputs(item: Locator) {
  return item.locator("input").evaluateAll((inputs) =>
    inputs.map((input) => {
      const rect = input.getBoundingClientRect();
      return {
        height: rect.height,
        width: rect.width,
      } satisfies InputMeasurement;
    }),
  );
}

async function expectNoHorizontalOverflow(page: Page, item: Locator) {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  const itemOverflow = await item.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(itemOverflow.scrollWidth).toBeLessThanOrEqual(itemOverflow.clientWidth + 1);

  const suggestion = item.locator(".genre-suggestion");
  if (await suggestion.count()) {
    const suggestionOverflow = await suggestion.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(suggestionOverflow.scrollWidth).toBeLessThanOrEqual(
      suggestionOverflow.clientWidth + 1,
    );
  }
}

test("@authenticated keeps import fields stable around long genre results", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);

  await page.addInitScript(() => {
    const NativeWorker = window.Worker;

    class LocalGenreWorkerStub extends EventTarget {
      postMessage(message: unknown) {
        const request = message as { id: string; type: string };
        const mode =
          window.localStorage.getItem("e2e-local-genre-layout-mode") ?? "hang";

        if (request.type === "prepare") {
          queueMicrotask(() => {
            this.dispatchEvent(
              new MessageEvent("message", {
                data: {
                  backend: "wasm",
                  id: request.id,
                  status: "ready",
                  type: "status",
                },
              }),
            );
          });
          return;
        }

        if (mode === "hang") return;

        queueMicrotask(() => {
          this.dispatchEvent(
            new MessageEvent("message", {
              data: {
                id: request.id,
                suggestion: {
                  alternatives: [
                    {
                      genre: "Electronic dance music with extended classification",
                      score: 0.71,
                      subgenre:
                        "Progressive melodic house with atmospheric elements",
                    },
                    {
                      genre:
                        "Electronic club music with hybrid rhythmic influences",
                      score: 0.63,
                      subgenre:
                        "Deep organic tech house with percussion-led arrangement",
                    },
                    {
                      genre:
                        "Electronic music for late-night dancefloor programming",
                      score: 0.57,
                      subgenre:
                        "Melodic techno with progressive and trance-adjacent textures",
                    },
                  ],
                  backend: "wasm",
                  genre: "Electronic",
                  score: 0.86,
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
  const email = `e2e-layout-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const title = `E2E Layout ${runId}`;

  await page.context().addCookies([
    {
      name: "djorganizer-locale",
      url: "http://127.0.0.1:3100",
      value: "en",
    },
  ]);
  await page.goto("/signup?next=/import");
  await page.getByLabel("Name").fill("DJ Layout E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/import$/, { timeout: 20_000 });
  await expect(page.getByText("Analysis ready")).toBeVisible({ timeout: 20_000 });

  await page.evaluate(() =>
    window.localStorage.setItem("e2e-local-genre-layout-mode", "hang"),
  );
  await page.locator("#audio-files").setInputFiles({
    buffer: createTestWav(260),
    mimeType: "audio/wav",
    name: `${title}.wav`,
  });

  const item = page
    .locator("article.import-item")
    .filter({ hasText: `${title}.wav` });
  await expect(item).toBeVisible({ timeout: 20_000 });
  await expect(item.getByRole("button", { name: "Cancel" })).toBeVisible({
    timeout: 30_000,
  });

  const widths = [1440, 980, 640, 390] as const;
  const before = new Map<number, InputMeasurement[]>();

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page, item);
    before.set(width, await measureInputs(item));
  }

  await item.getByRole("button", { name: "Cancel" }).click();
  await expect(item.getByText("Analysis cancelled.")).toBeVisible();
  await expect(
    item.getByRole("button", { name: "Retry genre and subgenre analysis" }),
  ).toBeVisible();

  await page.evaluate(() =>
    window.localStorage.setItem("e2e-local-genre-layout-mode", "ready"),
  );
  await item
    .getByRole("button", { name: "Retry genre and subgenre analysis" })
    .click();

  const suggestion = item.locator(".genre-suggestion");
  await expect(suggestion).toBeVisible({ timeout: 30_000 });
  await expect(suggestion).toContainText("Calculated result");
  await expect(suggestion).toContainText(
    "Progressive melodic house with atmospheric elements",
  );
  await expect(suggestion).toContainText(
    "Deep organic tech house with percussion-led arrangement",
  );
  await expect(suggestion).toContainText(
    "Melodic techno with progressive and trance-adjacent textures",
  );

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page, item);

    const after = await measureInputs(item);
    const baseline = before.get(width);
    expect(baseline).toBeDefined();
    expect(after).toHaveLength(baseline!.length);

    after.forEach((measurement, index) => {
      expect(
        Math.abs(measurement.width - baseline![index].width),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(measurement.height - baseline![index].height),
      ).toBeLessThanOrEqual(1);
    });
  }
});
