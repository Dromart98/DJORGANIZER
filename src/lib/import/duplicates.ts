type FingerprintedItem = {
  client_id: string;
  file_fingerprint: string;
};

export function duplicateClientIds(items: FingerprintedItem[]) {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const item of items) {
    if (seen.has(item.file_fingerprint)) {
      duplicates.push(item.client_id);
    } else {
      seen.add(item.file_fingerprint);
    }
  }

  return duplicates;
}
