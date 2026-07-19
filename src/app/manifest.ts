import type { MetadataRoute } from "next";
import { createPwaManifest } from "@/lib/pwa/manifest";
import { getCurrentLocale } from "@/lib/i18n/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  return createPwaManifest(await getCurrentLocale());
}
