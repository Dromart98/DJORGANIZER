import type { MetadataRoute } from "next";
import { translate } from "@/lib/i18n/functional";
import type { Locale } from "@/lib/i18n/i18n";

export const PWA_COLORS = {
  background: "#080d12",
  theme: "#080d12",
} as const;

export function createPwaManifest(locale: Locale = "es"): MetadataRoute.Manifest {
  return {
    background_color: PWA_COLORS.background,
    description: translate(
      locale,
      "Organiza tu biblioteca musical para cada sesión.",
    ),
    display: "standalone",
    icons: [
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
    ],
    lang: locale,
    name: "DJOrganizer",
    scope: "/",
    short_name: "DJOrganizer",
    start_url: "/",
    theme_color: PWA_COLORS.theme,
  };
}
