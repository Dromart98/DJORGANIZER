import { createHash } from "node:crypto";

export function crateOrderDigest(trackIds: readonly string[]) {
  return createHash("sha256").update(trackIds.join("\n")).digest("hex");
}
