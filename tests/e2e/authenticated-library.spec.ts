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
  const runId = `${Date.now()}-${testInfo.workerIndex}`;
  const email = `e2e-${runId}@djorganizer.test`;
  const password = `DjOrganizer-${runId}!`;
  const firstTitle = `E2E Warmup ${runId}`;
  const secondTitle = `E2E Peak ${runId}`;
  const crateName = `E2E Set ${runId}`;

  await page.goto("/signup?next=/import");
  await page.getByLabel("Nombre").fill("DJ E2E");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Crear cuenta" }).click();

  await expect(page).toHaveURL(/\/import$/, { timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: "Importar música" }),
  ).toBeVisible();

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
    await expect(item.getByLabel("Artista (opcional)")).toHaveValue("");
  };

  await fillReviewedAnalysis(firstItem, "120", "Am");
  await fillReviewedAnalysis(secondItem, "128", "C");

  await page.getByRole("button", { name: "Guardar 2 pistas" }).click();
  await expect(page.getByText("Guardada", { exact: true })).toHaveCount(2, {
    timeout: 20_000,
  });

  await page.goto("/library");
  await expect(
    page.getByRole("heading", { name: "Biblioteca" }),
  ).toBeVisible();
  await expect(page.getByText(firstTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(secondTitle, { exact: true })).toBeVisible();
  await expect(
    page.locator("tbody").getByText("Artista desconocido", { exact: true }),
  ).toHaveCount(2);

  await page.goto("/crates");
  const createCrateForm = page
    .locator("form.organization-form")
    .filter({ has: page.getByRole("heading", { name: "Crear crate" }) });
  await createCrateForm.getByLabel("Nombre").fill(crateName);
  await createCrateForm
    .getByLabel("Descripción")
    .fill("Progresión autenticada de extremo a extremo");
  await createCrateForm.getByRole("button", { name: "Crear crate" }).click();

  await expect(page).toHaveURL(/\/crates\/[0-9a-f-]+\?created=1$/, {
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: crateName })).toBeVisible();

  const addTrack = async (title: string) => {
    const candidate = page
      .locator(".available-track-list li")
      .filter({ hasText: title });
    await expect(candidate).toBeVisible();
    await candidate.getByRole("button", { name: "Añadir" }).click();
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
    .getByRole("button", { name: `Subir ${secondTitle}` })
    .click();
  await expect(orderedTitles.nth(0)).toContainText(secondTitle);
  await expect(orderedTitles.nth(1)).toContainText(firstTitle);
});
