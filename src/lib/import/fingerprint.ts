export type HashableBlob = {
  size: number;
  stream(): ReadableStream<Uint8Array>;
};

export async function fingerprintBlob(
  blob: HashableBlob,
  onProgress?: (percentage: number) => void,
) {
  const { createSHA256 } = await import("hash-wasm");
  const hasher = await createSHA256();
  const reader = blob.stream().getReader();
  let processedBytes = 0;

  hasher.init();
  onProgress?.(0);

  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      hasher.update(chunk.value);
      processedBytes += chunk.value.byteLength;
      const percentage =
        blob.size === 0 ? 100 : Math.round((processedBytes / blob.size) * 100);
      onProgress?.(Math.min(percentage, 100));
      chunk = await reader.read();
    }
  } finally {
    reader.releaseLock();
  }

  onProgress?.(100);
  return hasher.digest("hex");
}
