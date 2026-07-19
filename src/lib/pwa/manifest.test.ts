import { describe, expect, it } from "vitest";
import { createPwaManifest, PWA_COLORS } from "@/lib/pwa/manifest";

describe("createPwaManifest", () => {
  it("creates an installable standalone manifest", () => {
    const manifest = createPwaManifest();

    expect(manifest).toMatchObject({
      background_color: PWA_COLORS.background,
      display: "standalone",
      lang: "es",
      name: "DJOrganizer",
      scope: "/",
      short_name: "DJOrganizer",
      start_url: "/",
      theme_color: PWA_COLORS.theme,
    });
    expect(manifest.icons).toEqual([
      {
        purpose: "any",
        sizes: "any",
        src: "/icon.svg",
        type: "image/svg+xml",
      },
      {
        purpose: "maskable",
        sizes: "any",
        src: "/icon-maskable.svg",
        type: "image/svg+xml",
      },
    ]);
  });

  it("localizes visible install metadata", () => {
    expect(createPwaManifest("en")).toMatchObject({
      description: "Organize your music library for every set.",
      lang: "en",
      name: "DJOrganizer",
    });
  });
});
