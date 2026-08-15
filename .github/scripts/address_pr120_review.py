from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


review = Path("src/lib/desktop/scan-review.ts")
text = review.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''export interface OrganizationPreviewItem {
  sourcePath: string;
  targetPath: string;
  collisionResolved: boolean;
}''',
    '''export interface OrganizationPreviewItem {
  sourcePath: string;
  targetPath: string;
  collisionResolved: boolean;
  excluded?: boolean;
}''',
    "preview excluded flag",
)
text = replace_once(
    text,
    '''      if (
        scheme === "genre-subgenre" &&
        options.missingSubgenreMode === "exclude" &&
        !options.linkedMetadataByScanId?.get(track.scanId)?.subgenre?.trim()
      ) {
        return [];
      }
      const folders = organizationFolders(''',
    '''      if (
        scheme === "genre-subgenre" &&
        options.missingSubgenreMode === "exclude" &&
        !options.linkedMetadataByScanId?.get(track.scanId)?.subgenre?.trim()
      ) {
        return [
          {
            sourcePath: track.relativePath,
            targetPath: track.relativePath,
            collisionResolved: false,
            excluded: true,
          },
        ];
      }
      const folders = organizationFolders(''',
    "visible excluded preview item",
)
text = replace_once(
    text,
    '''  for (const item of preview.slice(0, ORGANIZATION_TREE_PREVIEW_PATH_LIMIT)) {
    const folders = item.targetPath.split("/").slice(0, -1);''',
    '''  for (const item of preview
    .filter((entry) => !entry.excluded)
    .slice(0, ORGANIZATION_TREE_PREVIEW_PATH_LIMIT)) {
    const folders = item.targetPath.split("/").slice(0, -1);''',
    "exclude no-op items from tree",
)
review.write_text(text, encoding="utf-8")


tests = Path("src/lib/desktop/scan-review.test.ts")
text = tests.read_text(encoding="utf-8")
old = '''    expect(
      createOrganizationPreview(tracks, "genre-subgenre", {
        linkedMetadataByScanId: withSubgenre,
        missingSubgenreMode: "exclude",
      }),
    ).toHaveLength(1);
    expect(countMissingSubgenreTracks(tracks, withSubgenre)).toBe(1);'''
new = '''    const exclusionPreview = createOrganizationPreview(tracks, "genre-subgenre", {
      linkedMetadataByScanId: withSubgenre,
      missingSubgenreMode: "exclude",
    });
    expect(exclusionPreview).toHaveLength(2);
    expect(exclusionPreview.find((item) => item.sourcePath === "Set/Closing.flac"))
      .toEqual({
        collisionResolved: false,
        excluded: true,
        sourcePath: "Set/Closing.flac",
        targetPath: "Set/Closing.flac",
      });
    expect(countMissingSubgenreTracks(tracks, withSubgenre)).toBe(1);'''
text = replace_once(text, old, new, "visible exclusion test")
tests.write_text(text, encoding="utf-8")


scanner = Path("src/components/desktop/folder-scanner.tsx")
text = scanner.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  const missingSubgenreCount = useMemo(
    () => countMissingSubgenreTracks(selectedTracks, linkedOrganizationMetadataByScanId),
    [linkedOrganizationMetadataByScanId, selectedTracks],
  );''',
    '''  const missingSubgenreScanIds = useMemo(
    () =>
      selectedTracks
        .filter(
          (track) =>
            !linkedOrganizationMetadataByScanId.get(track.scanId)?.subgenre?.trim(),
        )
        .map((track) => track.scanId)
        .sort(),
    [linkedOrganizationMetadataByScanId, selectedTracks],
  );
  const missingSubgenreCount = missingSubgenreScanIds.length;
  const missingSubgenreSelectionSignature = missingSubgenreScanIds.join("|");''',
    "missing subgenre id set",
)
effect_anchor = '''  useEffect(() => {
    if (!selectedTracks.length) return;
    setMetadataDrafts((current) => {'''
effect_new = '''  useEffect(() => {
    setConfirmMissingSubgenreExclusion(false);
  }, [missingSubgenreSelectionSignature]);

  useEffect(() => {
    if (!selectedTracks.length) return;
    setMetadataDrafts((current) => {'''
text = replace_once(text, effect_anchor, effect_new, "reset exclusion consent")
confirm_anchor = '''    if (
      apply &&
      !window.confirm(
        locale === "en"
          ? `${selectedTracks.length} files will be moved inside ${result.rootName}. You can undo this operation while the session remains open. Continue?`
          : `Se moverán ${selectedTracks.length} archivos dentro de ${result.rootName}. Podrás deshacer esta operación mientras la sesión siga abierta. ¿Continuar?`,
      )
    ) {'''
confirm_new = '''    const excludedSubgenreCount =
      organizationScheme === "genre-subgenre" && missingSubgenreMode === "exclude"
        ? missingSubgenreCount
        : 0;
    const includedTrackCount = selectedTracks.length - excludedSubgenreCount;
    if (
      apply &&
      !window.confirm(
        locale === "en"
          ? `The batch includes ${includedTrackCount} files to reorganize inside ${result.rootName}${excludedSubgenreCount ? ` and leaves ${excludedSubgenreCount} confirmed tracks without subgenre untouched` : ""}. You can undo moved files while the session remains open. Continue?`
          : `El lote incluye ${includedTrackCount} archivos para reorganizar dentro de ${result.rootName}${excludedSubgenreCount ? ` y deja sin mover ${excludedSubgenreCount} pistas sin subgénero cuya exclusión confirmaste` : ""}. Podrás deshacer los archivos movidos mientras la sesión siga abierta. ¿Continuar?`,
      )
    ) {'''
text = replace_once(text, confirm_anchor, confirm_new, "accurate final confirmation")
list_anchor = '''                    {organizationPreview.slice(0, 10).map((item) => (
                      <li key={item.targetPath}>
                        <span>{item.sourcePath}</span>
                        <strong>→ {item.targetPath}</strong>
                        {item.collisionResolved ? (
                          <small>{t("Nombre ajustado para evitar una colisión")}</small>
                        ) : null}
                      </li>
                    ))}'''
list_new = '''                    {organizationPreview.slice(0, 10).map((item) => (
                      <li key={`${item.sourcePath}:${item.targetPath}:${item.excluded ? "excluded" : "move"}`}>
                        <span>{item.sourcePath}</span>
                        {item.excluded ? (
                          <strong>
                            {locale === "en"
                              ? "Excluded · file will remain in place"
                              : "Excluida · el archivo permanecerá en su sitio"}
                          </strong>
                        ) : (
                          <strong>→ {item.targetPath}</strong>
                        )}
                        {item.collisionResolved ? (
                          <small>{t("Nombre ajustado para evitar una colisión")}</small>
                        ) : null}
                      </li>
                    ))}'''
text = replace_once(text, list_anchor, list_new, "explicit excluded preview status")
scanner.write_text(text, encoding="utf-8")

Path(".github/scripts/address_pr120_review.py").unlink()
Path(".github/workflows/temporary-pr120-review.yml").unlink()
