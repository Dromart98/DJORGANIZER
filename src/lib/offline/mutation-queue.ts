export type OfflineAction =
  | "crate-create"
  | "crate-delete"
  | "crate-track-add"
  | "crate-track-move"
  | "crate-track-remove"
  | "crate-update"
  | "tag-assign"
  | "tag-create"
  | "tag-delete"
  | "tag-unassign"
  | "track-bulk-update"
  | "track-create"
  | "track-delete"
  | "track-update";

export type OfflineMutation = {
  action?: OfflineAction;
  attempts?: number;
  createdAt: string;
  entity: "crate" | "crate_track" | "tag" | "tag_assignment" | "track";
  entityId: string;
  id: string;
  lastError?: string;
  operation: "create" | "delete" | "update";
  payload: Record<string, unknown>;
  revision: string | null;
  status?: "conflict" | "failed" | "pending";
};

export type SyncConflict = {
  local: OfflineMutation;
  reason: "deleted-remotely" | "revision-mismatch";
  remote: Record<string, unknown> | null;
};

export function compactMutationQueue(
  mutations: readonly OfflineMutation[],
): OfflineMutation[] {
  const compacted = new Map<string, OfflineMutation>();
  for (const mutation of mutations) {
    const key = `${mutation.entity}:${mutation.entityId}`;
    const previous = compacted.get(key);
    if (!previous) {
      compacted.set(key, mutation);
      continue;
    }
    if (previous.operation === "create" && mutation.operation === "delete") {
      compacted.delete(key);
      continue;
    }
    compacted.set(key, {
      ...mutation,
      action: mutation.action ?? previous.action,
      operation: previous.operation === "create" ? "create" : mutation.operation,
      payload: { ...previous.payload, ...mutation.payload },
      status: mutation.status ?? "pending",
    });
  }
  return [...compacted.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

export function discardFailedMutations(
  mutations: readonly OfflineMutation[],
): OfflineMutation[] {
  return mutations.filter((mutation) => mutation.status !== "failed");
}

export function findSyncConflict(
  mutation: OfflineMutation,
  remote: { revision?: string } | null,
): SyncConflict | null {
  if (!remote && mutation.operation !== "create") {
    return { local: mutation, reason: "deleted-remotely", remote: null };
  }
  if (
    remote &&
    mutation.revision &&
    remote.revision &&
    mutation.revision !== remote.revision
  ) {
    return {
      local: mutation,
      reason: "revision-mismatch",
      remote: remote as Record<string, unknown>,
    };
  }
  return null;
}

const STORAGE_KEY = "djorganizer:offline-mutations:v1";
export const MAX_OFFLINE_MUTATIONS = 500;

function isOfflineMutation(value: unknown): value is OfflineMutation {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<OfflineMutation>;
  return (
    typeof item.id === "string" &&
    typeof item.entityId === "string" &&
    typeof item.createdAt === "string" &&
    ["crate", "crate_track", "tag", "tag_assignment", "track"].includes(
      item.entity ?? "",
    ) &&
    ["create", "delete", "update"].includes(item.operation ?? "") &&
    !!item.payload &&
    typeof item.payload === "object" &&
    !Array.isArray(item.payload)
  );
}

export function loadOfflineMutations(storage: Pick<Storage, "getItem">) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter(isOfflineMutation).slice(-MAX_OFFLINE_MUTATIONS)
      : [];
  } catch {
    return [];
  }
}

export function saveOfflineMutations(
  storage: Pick<Storage, "setItem">,
  mutations: readonly OfflineMutation[],
) {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      compactMutationQueue(mutations).slice(-MAX_OFFLINE_MUTATIONS),
    ),
  );
}

export function formDataToOfflinePayload(formData: FormData) {
  const payload: Record<string, string | string[]> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const previous = payload[name];
    if (previous === undefined) payload[name] = value;
    else if (Array.isArray(previous)) previous.push(value);
    else payload[name] = [previous, value];
  }
  return payload;
}

export function offlineEntityForAction(
  action: OfflineAction,
  payload: Record<string, unknown>,
  fallbackId: string,
): Pick<OfflineMutation, "entity" | "entityId" | "operation"> {
  const text = (key: string) =>
    typeof payload[key] === "string" && payload[key] ? payload[key] : fallbackId;
  if (action.startsWith("crate-track")) {
    return {
      entity: "crate_track",
      entityId: `${text("crateId")}:${text("trackId")}`,
      operation: action === "crate-track-remove" ? "delete" : "update",
    };
  }
  if (action === "tag-assign" || action === "tag-unassign") {
    const trackIds = Array.isArray(payload.trackId)
      ? payload.trackId.join(",")
      : text("trackId");
    return {
      entity: "tag_assignment",
      entityId: `${text("tagId")}:${trackIds}`,
      operation: action === "tag-unassign" ? "delete" : "update",
    };
  }
  const entity = action.startsWith("crate")
    ? "crate"
    : action.startsWith("tag")
      ? "tag"
      : "track";
  const operation = action.endsWith("create")
    ? "create"
    : action.endsWith("delete")
      ? "delete"
      : "update";
  const ids = Array.isArray(payload.trackId)
    ? payload.trackId.join(",")
    : text("id");
  return { entity, entityId: ids, operation };
}
