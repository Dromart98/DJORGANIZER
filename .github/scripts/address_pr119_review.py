from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


review = Path("src/lib/desktop/scan-review.ts")
text = review.read_text(encoding="utf-8")
text = replace_once(
    text,
    "export const DESKTOP_SCAN_PAGE_SIZE = 25;",
    "export const DESKTOP_SCAN_PAGE_SIZE = 25;\nexport const ORGANIZATION_TREE_PREVIEW_PATH_LIMIT = 100;",
    "tree preview limit constant",
)
text = replace_once(
    text,
    "  for (const item of preview) {",
    "  for (const item of preview.slice(0, ORGANIZATION_TREE_PREVIEW_PATH_LIMIT)) {",
    "bounded organization tree",
)
review.write_text(text, encoding="utf-8")


tests = Path("src/lib/desktop/scan-review.test.ts")
text = tests.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  createOrganizationTree,
  filterScannedTracks,''',
    '''  createOrganizationTree,
  filterScannedTracks,
  ORGANIZATION_TREE_PREVIEW_PATH_LIMIT,''',
    "tree test import",
)
test_anchor = '''  it("builds a hierarchical folder tree from the preview", () => {
    const preview = createOrganizationPreview(
      [tracks[0], { ...tracks[0], scanId: "track-3", artist: "DJ Boreal" }],
      "rules",
      { ruleLevels: ["genre", "artist"] },
    );
    expect(createOrganizationTree(preview)).toEqual([
      {
        name: "House",
        children: [
          { name: "DJ Aurora", children: [] },
          { name: "DJ Boreal", children: [] },
        ],
      },
    ]);
  });'''
test_new = test_anchor + '''

  it("bounds the rendered tree preview for large high-cardinality selections", () => {
    const preview = Array.from(
      { length: ORGANIZATION_TREE_PREVIEW_PATH_LIMIT + 50 },
      (_, index) => ({
        collisionResolved: false,
        sourcePath: `source-${index}.mp3`,
        targetPath: `Artist ${index}/Album ${index}/Track ${index}.mp3`,
      }),
    );
    const tree = createOrganizationTree(preview);
    const countNodes = (nodes: ReturnType<typeof createOrganizationTree>): number =>
      nodes.reduce(
        (total, node) => total + 1 + countNodes(node.children),
        0,
      );

    expect(tree).toHaveLength(ORGANIZATION_TREE_PREVIEW_PATH_LIMIT);
    expect(countNodes(tree)).toBe(ORGANIZATION_TREE_PREVIEW_PATH_LIMIT * 2);
  });'''
text = replace_once(text, test_anchor, test_new, "bounded tree test")
tests.write_text(text, encoding="utf-8")


scanner = Path("src/components/desktop/folder-scanner.tsx")
text = scanner.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  organizationRulesUseLinkedMetadata,
  organizationSchemeUsesBpmRanges,
  paginateScannedTracks,''',
    '''  organizationRulesUseLinkedMetadata,
  organizationSchemeUsesBpmRanges,
  ORGANIZATION_TREE_PREVIEW_PATH_LIMIT,
  paginateScannedTracks,''',
    "tree limit import",
)
tree_anchor = '''                  {organizationScheme === "rules" && organizationTree.length ? (
                    <div className="organization-tree-preview">
                      <strong>{t("Árbol resultante")}</strong>
                      <OrganizationTreeList nodes={organizationTree} />
                    </div>
                  ) : null}'''
tree_new = '''                  {organizationScheme === "rules" && organizationTree.length ? (
                    <div className="organization-tree-preview">
                      <strong>{t("Árbol resultante")}</strong>
                      <OrganizationTreeList nodes={organizationTree} />
                      {organizationPreview.length > ORGANIZATION_TREE_PREVIEW_PATH_LIMIT ? (
                        <small>
                          {locale === "en"
                            ? `Tree preview limited to the first ${ORGANIZATION_TREE_PREVIEW_PATH_LIMIT.toLocaleString(locale)} proposed paths for performance. The final native simulation still validates the complete selection.`
                            : `El árbol se limita a las primeras ${ORGANIZATION_TREE_PREVIEW_PATH_LIMIT.toLocaleString(locale)} rutas propuestas para mantener el rendimiento. La simulación nativa final sigue validando la selección completa.`}
                        </small>
                      ) : null}
                    </div>
                  ) : null}'''
text = replace_once(text, tree_anchor, tree_new, "bounded tree notice")
scanner.write_text(text, encoding="utf-8")


rust = Path("src-tauri/src/lib.rs")
text = rust.read_text(encoding="utf-8")
old_energy = '''    state
        .library_energy
        .lock()
        .map_err(|_| "No se pudo reiniciar la energía vinculada.".to_owned())?
        .retain(|(linked_session_id, _), _| linked_session_id != &session_id);'''
new_energy = '''    state
        .library_energy
        .lock()
        .map_err(|_| "No se pudo reiniciar la energía vinculada.".to_owned())?
        .clear();'''
text = replace_once(text, old_energy, new_energy, "clear stale energy sessions")
old_metadata = '''    state
        .library_organization_metadata
        .lock()
        .map_err(|_| "No se pudieron reiniciar los metadatos vinculados.".to_owned())?
        .retain(|(linked_session_id, _), _| linked_session_id != &session_id);'''
new_metadata = '''    state
        .library_organization_metadata
        .lock()
        .map_err(|_| "No se pudieron reiniciar los metadatos vinculados.".to_owned())?
        .clear();'''
text = replace_once(text, old_metadata, new_metadata, "clear stale metadata sessions")
rust.write_text(text, encoding="utf-8")


roadmap = Path("docs/roadmap.md")
text = roadmap.read_text(encoding="utf-8")
old_roadmap = '''5. - [ ] Sustituir la dependencia exclusiva de plantillas fijas por un constructor
   de reglas de organización de uno a tres niveles. Los niveles disponibles serán
   género, subgénero cuando exista, artista, álbum, tonalidad, Camelot, BPM,
   rango de BPM, energía y año. Debe impedir combinaciones vacías o duplicadas y
   mostrar el árbol resultante antes de mover archivos.'''
new_roadmap = '''5. - [x] Sustituir la dependencia exclusiva de plantillas fijas por un constructor
   de reglas de organización de uno a tres niveles, manteniendo las plantillas
   anteriores como atajos. Los niveles disponibles son género, subgénero, artista,
   álbum, tonalidad, Camelot, BPM, rango de BPM, energía y año. Impide reglas
   vacías, con huecos o niveles duplicados; subgénero, Camelot, energía y año solo
   se habilitan con metadatos de Biblioteca vinculados a coincidencias locales
   confirmadas. Muestra un árbol previo acotado para mantener el rendimiento y la
   simulación nativa final valida siempre la selección completa antes de mover.'''
text = replace_once(text, old_roadmap, new_roadmap, "roadmap rule builder item")
roadmap.write_text(text, encoding="utf-8")

Path(".github/scripts/address_pr119_review.py").unlink()
Path(".github/workflows/temporary-pr119-review.yml").unlink()
