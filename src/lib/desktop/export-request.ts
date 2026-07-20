export type DesktopExportRequest = {
  crateId?: string;
  crateName?: string;
  trackIds: string[];
};

export const DESKTOP_EXPORT_REQUEST_KEY = "djorganizer-export-request";

export function isDesktopExportRequest(
  value: unknown,
): value is DesktopExportRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return (
    Array.isArray(request.trackIds) &&
    request.trackIds.every((trackId) => typeof trackId === "string") &&
    (request.crateId === undefined || typeof request.crateId === "string") &&
    (request.crateName === undefined || typeof request.crateName === "string")
  );
}

export function resolveLinkedScanIds(
  request: DesktopExportRequest,
  links: readonly { scanId: string; trackId: string }[],
) {
  const scanIdByTrackId = new Map(links.map((link) => [link.trackId, link.scanId]));
  const requestedTrackIds = [...new Set(request.trackIds)];
  const scanIds = requestedTrackIds.flatMap((trackId) => {
    const scanId = scanIdByTrackId.get(trackId);
    return scanId ? [scanId] : [];
  });
  return { omitted: requestedTrackIds.length - scanIds.length, scanIds };
}
