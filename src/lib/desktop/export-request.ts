export type DesktopExportRequest = {
  crateId?: string;
  crateName?: string;
  trackIds: string[];
};

export const DESKTOP_EXPORT_REQUEST_KEY = "djorganizer-export-request";

export function resolveLinkedScanIds(
  request: DesktopExportRequest,
  links: readonly { scanId: string; trackId: string }[],
) {
  const scanIdByTrackId = new Map(links.map((link) => [link.trackId, link.scanId]));
  const scanIds = request.trackIds.flatMap((trackId) => {
    const scanId = scanIdByTrackId.get(trackId);
    return scanId ? [scanId] : [];
  });
  return { omitted: request.trackIds.length - scanIds.length, scanIds };
}
