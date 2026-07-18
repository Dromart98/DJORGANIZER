import type { MetadataRoute } from "next";
import { createPwaManifest } from "@/lib/pwa/manifest";

export default function manifest(): MetadataRoute.Manifest {
  return createPwaManifest();
}
