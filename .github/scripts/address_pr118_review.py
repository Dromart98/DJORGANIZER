from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


scanner = Path("src/components/desktop/folder-scanner.tsx")
text = scanner.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  const [linkedEnergyByScanId, setLinkedEnergyByScanId] = useState<
    Map<string, number>
  >(() => new Map());''',
    '''  const [linkedEnergyByScanId, setLinkedEnergyByScanId] = useState<
    Map<string, number>
  >(() => new Map());
  const [energyLinkReady, setEnergyLinkReady] = useState(false);''',
    "energy link readiness state",
)
text = replace_once(
    text,
    '''      clearTrackLinks();
      setLinkedEnergyByScanId(new Map());
      setLibraryLinkMessage(''',
    '''      clearTrackLinks();
      setLinkedEnergyByScanId(new Map());
      setEnergyLinkReady(false);
      setLibraryLinkMessage(''',
    "energy link reset",
)
text = replace_once(
    text,
    '''        setLinkedEnergyByScanId(
          new Map(
            linkResult.links.flatMap((link) => {
              const energy = energyByTrackId.get(link.trackId);
              return energy === undefined ? [] : [[link.scanId, energy] as const];
            }),
          ),
        );
        replaceTrackLinks(scanResult.sessionId, linkResult.links);''',
    '''        setLinkedEnergyByScanId(
          new Map(
            linkResult.links.flatMap((link) => {
              const energy = energyByTrackId.get(link.trackId);
              return energy === undefined ? [] : [[link.scanId, energy] as const];
            }),
          ),
        );
        setEnergyLinkReady(true);
        replaceTrackLinks(scanResult.sessionId, linkResult.links);''',
    "energy link success",
)
text = replace_once(
    text,
    '''    if (usesBpmRanges && !bpmBoundaries) {
      setReorganizationMessage(''',
    '''    if (organizationScheme === "energy-bpm-range" && !energyLinkReady) {
      setReorganizationMessage(
        locale === "en"
          ? "Relink this scan with the library before organizing by energy."
          : "Vuelve a vincular este escaneo con la biblioteca antes de organizar por energía.",
      );
      return;
    }
    if (usesBpmRanges && !bpmBoundaries) {
      setReorganizationMessage(''',
    "energy reorganization guard",
)
old_disabled = '''disabled={reorganizationBusy || (usesBpmRanges && !bpmBoundaries)}'''
new_disabled = '''disabled={
                        reorganizationBusy ||
                        (usesBpmRanges && !bpmBoundaries) ||
                        (organizationScheme === "energy-bpm-range" && !energyLinkReady)
                      }'''
if text.count(old_disabled) != 2:
    raise SystemExit("reorganization button anchors not found")
text = text.replace(old_disabled, new_disabled)
text = replace_once(
    text,
    '''                  <p className="organization-muted">
                    {usesBpmRanges && !bpmBoundaries''',
    '''                  {organizationScheme === "energy-bpm-range" && !energyLinkReady ? (
                    <p className="organization-muted" role="status">
                      {locale === "en"
                        ? "Energy organization is disabled until this scan is linked successfully with the library."
                        : "La organización por energía está desactivada hasta que este escaneo se vincule correctamente con la biblioteca."}
                    </p>
                  ) : null}
                  <p className="organization-muted">
                    {usesBpmRanges && !bpmBoundaries''',
    "energy readiness message",
)
scanner.write_text(text, encoding="utf-8")

roadmap = Path("docs/roadmap.md")
text = roadmap.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''4. - [ ] Añadir organización física por rangos de BPM configurables. Debe admitir
   una estructura exclusiva por rango y combinaciones como género/rango de BPM,
   energía/rango de BPM o tonalidad/rango de BPM. Los límites se revisan antes de
   aplicar y nunca se crea una carpeta por valor exacto salvo elección expresa.''',
    '''4. - [x] Añadir organización física por rangos de BPM configurables. Admite
   una estructura exclusiva por rango y combinaciones género/rango de BPM,
   energía/rango de BPM y tonalidad/rango de BPM. El usuario revisa de 1 a 8
   cortes enteros, ascendentes y entre 20–300 antes de simular o aplicar; las
   pistas sin BPM permanecen visibles como `BPM desconocido`. La energía procede
   únicamente de vínculos confirmados con la biblioteca y la variante por energía
   queda bloqueada mientras ese vínculo no esté sincronizado. No se crea una
   carpeta por valor exacto salvo elección expresa.''',
    "roadmap BPM range item",
)
roadmap.write_text(text, encoding="utf-8")

Path(".github/scripts/address_pr118_review.py").unlink()
Path(".github/workflows/temporary-pr118-review.yml").unlink()
