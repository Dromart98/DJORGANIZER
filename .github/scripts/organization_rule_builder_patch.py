from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


# Authenticated library metadata exposed to the local linking flow.
actions = Path("src/app/import/actions.ts")
text = actions.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''export type DesktopLibraryLinkCandidate = {
  energy: number | null;
  fileFingerprint: string;
  fileSize: number;
  trackId: string;
};''',
    '''export type DesktopLibraryLinkCandidate = {
  camelotKey: string | null;
  energy: number | null;
  fileFingerprint: string;
  fileSize: number;
  releaseYear: number | null;
  subgenre: string | null;
  trackId: string;
};''',
    "desktop candidate type",
)
text = replace_once(
    text,
    '.select("id, file_fingerprint, file_size, energy", { count: "exact" })',
    '.select("id, file_fingerprint, file_size, energy, subgenre, camelot_key, release_year", { count: "exact" })',
    "desktop candidate select",
)
text = replace_once(
    text,
    '''          {
            energy:
              track.energy !== null &&
              Number.isInteger(track.energy) &&
              track.energy >= 0 &&
              track.energy <= 10
                ? track.energy
                : null,
            fileFingerprint: track.file_fingerprint,
            fileSize: track.file_size,
            trackId: track.id,
          },''',
    '''          {
            camelotKey:
              typeof track.camelot_key === "string" &&
              /^(?:[1-9]|1[0-2])[AB]$/.test(track.camelot_key)
                ? track.camelot_key
                : null,
            energy:
              track.energy !== null &&
              Number.isInteger(track.energy) &&
              track.energy >= 0 &&
              track.energy <= 10
                ? track.energy
                : null,
            fileFingerprint: track.file_fingerprint,
            fileSize: track.file_size,
            releaseYear:
              track.release_year !== null &&
              Number.isInteger(track.release_year) &&
              track.release_year >= 1000 &&
              track.release_year <= 9999
                ? track.release_year
                : null,
            subgenre:
              typeof track.subgenre === "string" && track.subgenre.trim()
                ? track.subgenre.trim().slice(0, 120)
                : null,
            trackId: track.id,
          },''',
    "desktop candidate mapping",
)
actions.write_text(text, encoding="utf-8")


# Typed translations for the builder controls.
i18n = Path("src/lib/i18n/functional.ts")
text = i18n.read_text(encoding="utf-8")
anchor = '  "Plan de organización": "Organization plan",\n'
addition = anchor + '''  "Reglas personalizadas": "Custom rules",
  "Nivel 1": "Level 1",
  "Nivel 2 (opcional)": "Level 2 (optional)",
  "Nivel 3 (opcional)": "Level 3 (optional)",
  "Sin nivel": "No level",
  "Árbol resultante": "Resulting tree",
'''
text = replace_once(text, anchor, addition, "builder translations")
i18n.write_text(text, encoding="utf-8")


# React builder wiring.
scanner = Path("src/components/desktop/folder-scanner.tsx")
text = scanner.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  createOrganizationPreview,
  filterScannedTracks,
  organizationSchemeUsesBpmRanges,
  paginateScannedTracks,
  parseBpmRangeBoundaries,
  type OrganizationScheme,
  type ScanReviewFilter,
  type ScannedAudioFile,''',
    '''  createOrganizationPreview,
  createOrganizationTree,
  filterScannedTracks,
  normalizeOrganizationRuleLevels,
  organizationRulesUseBpmRanges,
  organizationRulesUseLinkedMetadata,
  organizationSchemeUsesBpmRanges,
  paginateScannedTracks,
  parseBpmRangeBoundaries,
  type LinkedOrganizationMetadata,
  type OrganizationRuleLevel,
  type OrganizationScheme,
  type OrganizationTreeNode,
  type ScanReviewFilter,
  type ScannedAudioFile,''',
    "scan review imports",
)
helper_anchor = '''function formatTrackIdentity(track: ScannedAudioFile) {
  const identity = [track.artist, track.album, track.genre].filter(
    (value): value is string => Boolean(value),
  );
  return identity.length ? identity.join(" · ") : track.relativePath;
}
'''
helper_addition = helper_anchor + '''
const ORGANIZATION_RULE_LEVELS: OrganizationRuleLevel[] = [
  "genre",
  "subgenre",
  "artist",
  "album",
  "key",
  "camelot",
  "bpm",
  "bpm-range",
  "energy",
  "year",
];

function organizationRuleLabel(
  level: OrganizationRuleLevel,
  t: ReturnType<typeof useTranslator>["t"],
) {
  switch (level) {
    case "genre":
      return t("Género");
    case "subgenre":
      return t("Subgénero");
    case "artist":
      return t("Artista");
    case "album":
      return t("Álbum");
    case "key":
      return t("Tonalidad");
    case "camelot":
      return "Camelot";
    case "bpm":
      return "BPM";
    case "bpm-range":
      return t("Rango de BPM");
    case "energy":
      return t("Energía");
    case "year":
      return t("Año");
  }
}

function OrganizationTreeList({ nodes }: { nodes: readonly OrganizationTreeNode[] }) {
  return (
    <ul>
      {nodes.map((node) => (
        <li key={node.name}>
          <span>{node.name}</span>
          {node.children.length ? <OrganizationTreeList nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  );
}
'''
text = replace_once(text, helper_anchor, helper_addition, "builder helpers")
text = replace_once(
    text,
    '''  const [linkedEnergyByScanId, setLinkedEnergyByScanId] = useState<
    Map<string, number>
  >(() => new Map());
  const [energyLinkReady, setEnergyLinkReady] = useState(false);''',
    '''  const [linkedEnergyByScanId, setLinkedEnergyByScanId] = useState<
    Map<string, number>
  >(() => new Map());
  const [linkedOrganizationMetadataByScanId, setLinkedOrganizationMetadataByScanId] =
    useState<Map<string, LinkedOrganizationMetadata>>(() => new Map());
  const [organizationMetadataReady, setOrganizationMetadataReady] = useState(false);''',
    "linked organization metadata state",
)
text = replace_once(
    text,
    '''  const [organizationScheme, setOrganizationScheme] =
    useState<OrganizationScheme>("artist-album");
  const [bpmBoundaryInput, setBpmBoundaryInput] = useState("");''',
    '''  const [organizationScheme, setOrganizationScheme] =
    useState<OrganizationScheme>("artist-album");
  const [organizationRuleLevels, setOrganizationRuleLevels] = useState<
    (OrganizationRuleLevel | "")[]
  >(["genre", "", ""]);
  const [bpmBoundaryInput, setBpmBoundaryInput] = useState("");''',
    "rule builder state",
)
preview_old = '''  const usesBpmRanges = organizationSchemeUsesBpmRanges(organizationScheme);
  const organizationPreview = useMemo(
    () =>
      createOrganizationPreview(selectedTracks, organizationScheme, {
        bpmBoundaries: bpmBoundaries ?? undefined,
        energyByScanId: linkedEnergyByScanId,
      }),
    [bpmBoundaries, linkedEnergyByScanId, organizationScheme, selectedTracks],
  );'''
preview_new = '''  const normalizedOrganizationRuleLevels = useMemo(
    () => normalizeOrganizationRuleLevels(organizationRuleLevels),
    [organizationRuleLevels],
  );
  const usesBpmRanges =
    organizationSchemeUsesBpmRanges(organizationScheme) ||
    (organizationScheme === "rules" &&
      organizationRulesUseBpmRanges(organizationRuleLevels));
  const usesLinkedOrganizationMetadata =
    organizationScheme === "energy-bpm-range" ||
    (organizationScheme === "rules" &&
      organizationRulesUseLinkedMetadata(organizationRuleLevels));
  const organizationRulesValid =
    organizationScheme !== "rules" || Boolean(normalizedOrganizationRuleLevels);
  const organizationPreview = useMemo(
    () =>
      createOrganizationPreview(selectedTracks, organizationScheme, {
        bpmBoundaries: bpmBoundaries ?? undefined,
        energyByScanId: linkedEnergyByScanId,
        linkedMetadataByScanId: linkedOrganizationMetadataByScanId,
        ruleLevels: organizationRuleLevels,
      }),
    [
      bpmBoundaries,
      linkedEnergyByScanId,
      linkedOrganizationMetadataByScanId,
      organizationRuleLevels,
      organizationScheme,
      selectedTracks,
    ],
  );
  const organizationTree = useMemo(
    () =>
      organizationScheme === "rules"
        ? createOrganizationTree(organizationPreview)
        : [],
    [organizationPreview, organizationScheme],
  );
  const organizationConfigurationReady =
    organizationRulesValid &&
    (!usesBpmRanges || Boolean(bpmBoundaries)) &&
    (!usesLinkedOrganizationMetadata || organizationMetadataReady);'''
text = replace_once(text, preview_old, preview_new, "preview builder state")
text = replace_once(
    text,
    '''      clearTrackLinks();
      setLinkedEnergyByScanId(new Map());
      setEnergyLinkReady(false);''',
    '''      clearTrackLinks();
      setLinkedEnergyByScanId(new Map());
      setLinkedOrganizationMetadataByScanId(new Map());
      setOrganizationMetadataReady(false);''',
    "link metadata reset",
)
energy_map_anchor = '''        const energyByTrackId = new Map(
          library.candidates.flatMap((candidate) =>
            candidate.energy === null
              ? []
              : [[candidate.trackId, candidate.energy] as const],
          ),
        );'''
metadata_map = energy_map_anchor + '''
        const organizationMetadataByTrackId = new Map(
          library.candidates.map((candidate) => [
            candidate.trackId,
            {
              camelotKey: candidate.camelotKey,
              energy: candidate.energy,
              releaseYear: candidate.releaseYear,
              subgenre: candidate.subgenre,
            } satisfies LinkedOrganizationMetadata,
          ] as const),
        );'''
text = replace_once(text, energy_map_anchor, metadata_map, "organization metadata candidates")
text = replace_once(
    text,
    '''            energies: Object.fromEntries(energyByTrackId),
          },''',
    '''            energies: Object.fromEntries(energyByTrackId),
            organizationMetadata: Object.fromEntries(
              [...organizationMetadataByTrackId].map(([trackId, metadata]) => [
                trackId,
                {
                  camelotKey: metadata.camelotKey,
                  releaseYear: metadata.releaseYear,
                  subgenre: metadata.subgenre,
                },
              ]),
            ),
          },''',
    "native organization metadata input",
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
        setEnergyLinkReady(true);''',
    '''        setLinkedEnergyByScanId(
          new Map(
            linkResult.links.flatMap((link) => {
              const energy = energyByTrackId.get(link.trackId);
              return energy === undefined ? [] : [[link.scanId, energy] as const];
            }),
          ),
        );
        setLinkedOrganizationMetadataByScanId(
          new Map(
            linkResult.links.flatMap((link) => {
              const metadata = organizationMetadataByTrackId.get(link.trackId);
              return metadata === undefined ? [] : [[link.scanId, metadata] as const];
            }),
          ),
        );
        setOrganizationMetadataReady(true);''',
    "linked organization metadata mapping",
)
text = text.replace("energyLinkReady", "organizationMetadataReady")
run_guard = '''    if (organizationScheme === "energy-bpm-range" && !organizationMetadataReady) {
      setReorganizationMessage(
        locale === "en"
          ? "Relink this scan with the library before organizing by energy."
          : "Vuelve a vincular este escaneo con la biblioteca antes de organizar por energía.",
      );
      return;
    }'''
run_guard_new = '''    if (!organizationRulesValid) {
      setReorganizationMessage(
        locale === "en"
          ? "Choose between one and three unique organization levels without empty gaps."
          : "Elige entre uno y tres niveles de organización únicos y sin huecos vacíos.",
      );
      return;
    }
    if (usesLinkedOrganizationMetadata && !organizationMetadataReady) {
      setReorganizationMessage(
        locale === "en"
          ? "Relink this scan with the library before using subgenre, Camelot, energy or year."
          : "Vuelve a vincular este escaneo con la biblioteca antes de usar subgénero, Camelot, energía o año.",
      );
      return;
    }'''
text = replace_once(text, run_guard, run_guard_new, "rule run guard")
text = replace_once(
    text,
    '''            bpmBoundaries: usesBpmRanges ? bpmBoundaries ?? [] : [],
            scheme: organizationScheme,
            sessionId: result.sessionId,
            trackIds: selectedTracks.map((track) => track.scanId),''',
    '''            bpmBoundaries: usesBpmRanges ? bpmBoundaries ?? [] : [],
            ruleLevels:
              organizationScheme === "rules"
                ? normalizedOrganizationRuleLevels ?? []
                : [],
            scheme: organizationScheme,
            sessionId: result.sessionId,
            trackIds: selectedTracks.map((track) => track.scanId),''',
    "native rule request",
)
selector_anchor = '''                        <option value="key-bpm-range">{t("Tonalidad / rango de BPM")}</option>
                      </select>'''
selector_new = '''                        <option value="key-bpm-range">{t("Tonalidad / rango de BPM")}</option>
                        <option value="rules">{t("Reglas personalizadas")}</option>
                      </select>'''
text = replace_once(text, selector_anchor, selector_new, "custom rule option")
ui_anchor = '''                  </div>
                  {usesBpmRanges ? ('''
rule_ui = '''                  </div>
                  {organizationScheme === "rules" ? (
                    <div className="organization-rule-builder">
                      {organizationRuleLevels.map((selectedLevel, index) => (
                        <label key={index}>
                          {index === 0
                            ? t("Nivel 1")
                            : index === 1
                              ? t("Nivel 2 (opcional)")
                              : t("Nivel 3 (opcional)")}
                          <select
                            onChange={(event) => {
                              const nextLevel = event.target.value as OrganizationRuleLevel | "";
                              setOrganizationRuleLevels((current) => {
                                const next = [...current];
                                next[index] = nextLevel;
                                if (index === 1 && !nextLevel) next[2] = "";
                                return next;
                              });
                            }}
                            value={selectedLevel}
                          >
                            {index > 0 ? <option value="">{t("Sin nivel")}</option> : null}
                            {ORGANIZATION_RULE_LEVELS.map((level) => (
                              <option
                                disabled={organizationRuleLevels.some(
                                  (value, otherIndex) => otherIndex !== index && value === level,
                                )}
                                key={level}
                                value={level}
                              >
                                {organizationRuleLabel(level, t)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {usesBpmRanges ? ('''
text = replace_once(text, ui_anchor, rule_ui, "rule builder controls")
linked_notice_old = '''                  {organizationScheme === "energy-bpm-range" && !organizationMetadataReady ? (
                    <p className="organization-muted" role="status">
                      {locale === "en"
                        ? "Energy organization is disabled until this scan is linked successfully with the library."
                        : "La organización por energía está desactivada hasta que este escaneo se vincule correctamente con la biblioteca."}
                    </p>
                  ) : null}'''
linked_notice_new = '''                  {usesLinkedOrganizationMetadata && !organizationMetadataReady ? (
                    <p className="organization-muted" role="status">
                      {locale === "en"
                        ? "Rules that use subgenre, Camelot, energy or year are disabled until this scan is linked successfully with the library."
                        : "Las reglas que usan subgénero, Camelot, energía o año están desactivadas hasta que este escaneo se vincule correctamente con la biblioteca."}
                    </p>
                  ) : null}
                  {organizationScheme === "rules" && !organizationRulesValid ? (
                    <p className="organization-muted" role="alert">
                      {locale === "en"
                        ? "Choose one to three unique levels without empty gaps."
                        : "Elige de uno a tres niveles únicos y sin huecos vacíos."}
                    </p>
                  ) : null}'''
text = replace_once(text, linked_notice_old, linked_notice_new, "linked metadata notice")
preview_list_anchor = '''                  <ol>
                    {organizationPreview.slice(0, 10).map((item) => ('''
tree_block = '''                  {organizationScheme === "rules" && organizationTree.length ? (
                    <div className="organization-tree-preview">
                      <strong>{t("Árbol resultante")}</strong>
                      <OrganizationTreeList nodes={organizationTree} />
                    </div>
                  ) : null}
                  <ol>
                    {organizationPreview.slice(0, 10).map((item) => ('''
text = replace_once(text, preview_list_anchor, tree_block, "organization tree")
old_disabled = '''                        reorganizationBusy ||
                        (usesBpmRanges && !bpmBoundaries) ||
                        (organizationScheme === "energy-bpm-range" && !organizationMetadataReady)'''
new_disabled = '''                        reorganizationBusy ||
                        !organizationConfigurationReady'''
if text.count(old_disabled) != 2:
    raise SystemExit("organization button guards not found")
text = text.replace(old_disabled, new_disabled)
scanner.write_text(text, encoding="utf-8")


# Native rule contract and linked metadata cache.
rust = Path("src-tauri/src/lib.rs")
text = rust.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''struct DesktopState {
    active_track_analyses: Mutex<HashMap<String, ActiveTrackAnalysis>>,
    active_maest_analyses: Mutex<HashMap<String, ActiveMaestAnalysis>>,
    library_energy: Mutex<HashMap<(String, String), u8>>,''',
    '''struct DesktopState {
    active_track_analyses: Mutex<HashMap<String, ActiveTrackAnalysis>>,
    active_maest_analyses: Mutex<HashMap<String, ActiveMaestAnalysis>>,
    library_energy: Mutex<HashMap<(String, String), u8>>,
    library_organization_metadata:
        Mutex<HashMap<(String, String), LibraryOrganizationMetadataInput>>,''',
    "native organization metadata state",
)
text = replace_once(
    text,
    '''enum OrganizationScheme {
    ArtistAlbum,
    Genre,
    GenreArtist,
    KeyBpm,
    BpmRange,
    GenreBpmRange,
    EnergyBpmRange,
    KeyBpmRange,
}''',
    '''enum OrganizationScheme {
    ArtistAlbum,
    Genre,
    GenreArtist,
    KeyBpm,
    BpmRange,
    GenreBpmRange,
    EnergyBpmRange,
    KeyBpmRange,
    Rules,
}

#[derive(Clone, Debug, Deserialize, Hash, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum OrganizationRuleLevel {
    Genre,
    Subgenre,
    Artist,
    Album,
    Key,
    Camelot,
    Bpm,
    BpmRange,
    Energy,
    Year,
}''',
    "native organization rule enum",
)
text = replace_once(
    text,
    '''struct ReorganizationRequest {
    #[serde(default)]
    bpm_boundaries: Vec<u16>,
    scheme: OrganizationScheme,
    session_id: String,
    track_ids: Vec<String>,
}''',
    '''struct ReorganizationRequest {
    #[serde(default)]
    bpm_boundaries: Vec<u16>,
    #[serde(default)]
    rule_levels: Vec<OrganizationRuleLevel>,
    scheme: OrganizationScheme,
    session_id: String,
    track_ids: Vec<String>,
}''',
    "native rule request",
)
link_candidate_anchor = '''struct LibraryLinkCandidate {
    file_fingerprint: String,
    file_size: u64,
    track_id: String,
}
'''
link_candidate_new = link_candidate_anchor + '''
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LibraryOrganizationMetadataInput {
    camelot_key: Option<String>,
    release_year: Option<i16>,
    subgenre: Option<String>,
}
'''
text = replace_once(text, link_candidate_anchor, link_candidate_new, "native linked metadata type")

start = text.index("fn organization_scheme_uses_bpm_ranges(")
end = text.index("\nfn selected_session_tracks_from_session(", start)
new_block = r'''fn validate_organization_rule_levels(levels: &[OrganizationRuleLevel]) -> Result<(), String> {
    if levels.is_empty() || levels.len() > 3 {
        return Err("Configura entre uno y tres niveles de organización.".to_owned());
    }
    let unique = levels.iter().collect::<HashSet<_>>();
    if unique.len() != levels.len() {
        return Err("No repitas niveles en una regla de organización.".to_owned());
    }
    Ok(())
}

fn organization_rules_use_bpm_ranges(levels: &[OrganizationRuleLevel]) -> bool {
    levels.contains(&OrganizationRuleLevel::BpmRange)
}

fn organization_rules_use_linked_metadata(levels: &[OrganizationRuleLevel]) -> bool {
    levels.iter().any(|level| {
        matches!(
            level,
            OrganizationRuleLevel::Subgenre
                | OrganizationRuleLevel::Camelot
                | OrganizationRuleLevel::Energy
                | OrganizationRuleLevel::Year
        )
    })
}

fn organization_scheme_uses_bpm_ranges(
    scheme: &OrganizationScheme,
    rule_levels: &[OrganizationRuleLevel],
) -> bool {
    matches!(
        scheme,
        OrganizationScheme::BpmRange
            | OrganizationScheme::GenreBpmRange
            | OrganizationScheme::EnergyBpmRange
            | OrganizationScheme::KeyBpmRange
    ) || matches!(scheme, OrganizationScheme::Rules)
        && organization_rules_use_bpm_ranges(rule_levels)
}

fn validate_bpm_range_boundaries(boundaries: &[u16]) -> Result<(), String> {
    if boundaries.is_empty() || boundaries.len() > 8 {
        return Err("Configura entre 1 y 8 cortes de BPM.".to_owned());
    }
    if boundaries.iter().any(|value| !(20..=300).contains(value)) {
        return Err("Los cortes de BPM deben estar entre 20 y 300.".to_owned());
    }
    if boundaries.windows(2).any(|window| window[0] >= window[1]) {
        return Err(
            "Los cortes de BPM deben estar en orden ascendente y sin duplicados.".to_owned(),
        );
    }
    Ok(())
}

fn bpm_range_folder(bpm: Option<f64>, boundaries: &[u16]) -> String {
    let Some(bpm) = bpm.filter(|value| value.is_finite()) else {
        return "BPM desconocido".to_owned();
    };
    let rounded = bpm.round();
    let first = boundaries[0];
    if rounded < f64::from(first) {
        return format!("Menos de {first} BPM");
    }
    for window in boundaries.windows(2) {
        let lower = window[0];
        let upper_exclusive = window[1];
        if rounded < f64::from(upper_exclusive) {
            return format!("{lower}–{} BPM", upper_exclusive - 1);
        }
    }
    format!("{} BPM o más", boundaries[boundaries.len() - 1])
}

fn organization_rule_folder(
    track: &ScannedAudioFile,
    level: &OrganizationRuleLevel,
    bpm_boundaries: &[u16],
    energy: Option<u8>,
    metadata: Option<&LibraryOrganizationMetadataInput>,
) -> String {
    match level {
        OrganizationRuleLevel::Genre => {
            safe_path_segment(track.genre.as_deref(), "Género desconocido")
        }
        OrganizationRuleLevel::Subgenre => safe_path_segment(
            metadata.and_then(|value| value.subgenre.as_deref()),
            "Subgénero desconocido",
        ),
        OrganizationRuleLevel::Artist => {
            safe_path_segment(track.artist.as_deref(), "Artista desconocido")
        }
        OrganizationRuleLevel::Album => safe_path_segment(track.album.as_deref(), "Sin álbum"),
        OrganizationRuleLevel::Key => {
            safe_path_segment(track.musical_key.as_deref(), "Tonalidad desconocida")
        }
        OrganizationRuleLevel::Camelot => safe_path_segment(
            metadata.and_then(|value| value.camelot_key.as_deref()),
            "Camelot desconocido",
        ),
        OrganizationRuleLevel::Bpm => track
            .bpm
            .map(|bpm| format!("{} BPM", bpm.round()))
            .unwrap_or_else(|| "BPM desconocido".to_owned()),
        OrganizationRuleLevel::BpmRange => bpm_range_folder(track.bpm, bpm_boundaries),
        OrganizationRuleLevel::Energy => energy
            .filter(|value| *value <= 10)
            .map(|value| format!("Energía {value}"))
            .unwrap_or_else(|| "Energía desconocida".to_owned()),
        OrganizationRuleLevel::Year => metadata
            .and_then(|value| value.release_year)
            .map(|value| value.to_string())
            .unwrap_or_else(|| "Año desconocido".to_owned()),
    }
}

fn organization_folders(
    track: &ScannedAudioFile,
    scheme: &OrganizationScheme,
    rule_levels: &[OrganizationRuleLevel],
    bpm_boundaries: &[u16],
    energy: Option<u8>,
    metadata: Option<&LibraryOrganizationMetadataInput>,
) -> Vec<String> {
    match scheme {
        OrganizationScheme::Rules => rule_levels
            .iter()
            .map(|level| {
                organization_rule_folder(track, level, bpm_boundaries, energy, metadata)
            })
            .collect(),
        OrganizationScheme::Genre => vec![safe_path_segment(
            track.genre.as_deref(),
            "Género desconocido",
        )],
        OrganizationScheme::GenreArtist => vec![
            safe_path_segment(track.genre.as_deref(), "Género desconocido"),
            safe_path_segment(track.artist.as_deref(), "Artista desconocido"),
        ],
        OrganizationScheme::KeyBpm => vec![
            safe_path_segment(track.musical_key.as_deref(), "Tonalidad desconocida"),
            track
                .bpm
                .map(|bpm| format!("{} BPM", bpm.round()))
                .unwrap_or_else(|| "BPM desconocido".to_owned()),
        ],
        OrganizationScheme::BpmRange => vec![bpm_range_folder(track.bpm, bpm_boundaries)],
        OrganizationScheme::GenreBpmRange => vec![
            safe_path_segment(track.genre.as_deref(), "Género desconocido"),
            bpm_range_folder(track.bpm, bpm_boundaries),
        ],
        OrganizationScheme::EnergyBpmRange => vec![
            energy
                .filter(|value| *value <= 10)
                .map(|value| format!("Energía {value}"))
                .unwrap_or_else(|| "Energía desconocida".to_owned()),
            bpm_range_folder(track.bpm, bpm_boundaries),
        ],
        OrganizationScheme::KeyBpmRange => vec![
            safe_path_segment(track.musical_key.as_deref(), "Tonalidad desconocida"),
            bpm_range_folder(track.bpm, bpm_boundaries),
        ],
        OrganizationScheme::ArtistAlbum => vec![
            safe_path_segment(track.artist.as_deref(), "Artista desconocido"),
            safe_path_segment(track.album.as_deref(), "Sin álbum"),
        ],
    }
}

fn linked_energy_for_session(
    state: &DesktopState,
    session_id: &str,
) -> Result<HashMap<String, u8>, String> {
    let energy = state
        .library_energy
        .lock()
        .map_err(|_| "No se pudo leer la energía vinculada de la biblioteca.".to_owned())?;
    Ok(energy
        .iter()
        .filter_map(|((linked_session_id, scan_id), value)| {
            (linked_session_id == session_id).then(|| (scan_id.clone(), *value))
        })
        .collect())
}

fn linked_organization_metadata_for_session(
    state: &DesktopState,
    session_id: &str,
) -> Result<HashMap<String, LibraryOrganizationMetadataInput>, String> {
    let metadata = state
        .library_organization_metadata
        .lock()
        .map_err(|_| "No se pudieron leer los metadatos vinculados de la biblioteca.".to_owned())?;
    Ok(metadata
        .iter()
        .filter_map(|((linked_session_id, scan_id), value)| {
            (linked_session_id == session_id).then(|| (scan_id.clone(), value.clone()))
        })
        .collect())
}

fn build_reorganization_plan_with_options(
    session: &ScanSession,
    track_ids: &[String],
    scheme: &OrganizationScheme,
    rule_levels: &[OrganizationRuleLevel],
    bpm_boundaries: &[u16],
    energy_by_scan_id: &HashMap<String, u8>,
    metadata_by_scan_id: &HashMap<String, LibraryOrganizationMetadataInput>,
) -> Result<Vec<AppliedMove>, String> {
    if matches!(scheme, OrganizationScheme::Rules) {
        validate_organization_rule_levels(rule_levels)?;
    } else if !rule_levels.is_empty() {
        return Err("Los niveles personalizados solo se admiten con reglas personalizadas.".to_owned());
    }
    if organization_scheme_uses_bpm_ranges(scheme, rule_levels) {
        validate_bpm_range_boundaries(bpm_boundaries)?;
    } else if !bpm_boundaries.is_empty() {
        return Err("Los cortes de BPM solo se admiten en esquemas por rango.".to_owned());
    }
    let selected = selected_session_tracks_from_session(session, track_ids)?;
    let mut used_targets = HashSet::with_capacity(selected.len());
    let mut moves = Vec::with_capacity(selected.len());

    for session_track in selected {
        if !session_track.absolute_path.exists() {
            return Err(format!(
                "El archivo {} cambió o dejó de existir. Vuelve a escanear.",
                session_track.track.relative_path
            ));
        }
        let current_size = fs::metadata(&session_track.absolute_path)
            .map_err(|error| format!("No se pudo verificar un archivo: {error}"))?
            .len();
        if current_size != session_track.track.size_bytes {
            return Err(format!(
                "El archivo {} cambió desde el escaneo. No se aplicó el plan.",
                session_track.track.relative_path
            ));
        }

        let energy = energy_by_scan_id.get(&session_track.track.scan_id).copied();
        let metadata = metadata_by_scan_id.get(&session_track.track.scan_id);
        let folders = organization_folders(
            &session_track.track,
            scheme,
            rule_levels,
            bpm_boundaries,
            energy,
            metadata,
        );
        let original_stem = Path::new(&session_track.track.name)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Pista sin nombre");
        let stem = safe_path_segment(session_track.track.title.as_deref(), original_stem);
        let extension = session_track
            .track
            .extension
            .chars()
            .filter(|character| character.is_ascii_alphanumeric())
            .collect::<String>()
            .to_ascii_lowercase();
        let extension = if extension.is_empty() {
            "audio".to_owned()
        } else {
            extension
        };
        let mut relative_directory = PathBuf::new();
        for folder in &folders {
            relative_directory.push(folder);
        }
        let mut suffix = 1_u32;
        let mut relative_target = relative_directory.join(format!("{stem}.{extension}"));
        let mut target = session.root.join(&relative_target);

        while target != session_track.absolute_path
            && (target.exists()
                || used_targets.contains(&target.to_string_lossy().to_ascii_lowercase()))
        {
            suffix += 1;
            relative_target = relative_directory.join(format!("{stem} ({suffix}).{extension}"));
            target = session.root.join(&relative_target);
        }
        used_targets.insert(target.to_string_lossy().to_ascii_lowercase());
        if target != session_track.absolute_path {
            moves.push(AppliedMove {
                scan_id: session_track.track.scan_id,
                source: session_track.absolute_path,
                target,
            });
        }
    }
    Ok(moves)
}

fn build_reorganization_plan(
    session: &ScanSession,
    track_ids: &[String],
    scheme: &OrganizationScheme,
) -> Result<Vec<AppliedMove>, String> {
    build_reorganization_plan_with_options(
        session,
        track_ids,
        scheme,
        &[],
        &[],
        &HashMap::new(),
        &HashMap::new(),
    )
}

#[cfg(test)]
mod bpm_range_organization_tests {
    use super::*;

    fn track(bpm: Option<f64>) -> ScannedAudioFile {
        ScannedAudioFile {
            scan_id: "scan-1".into(),
            name: "Track.mp3".into(),
            relative_path: "Track.mp3".into(),
            extension: "mp3".into(),
            size_bytes: 1,
            metadata_read: true,
            title: Some("Track".into()),
            artist: Some("Artist".into()),
            album: None,
            genre: Some("House".into()),
            duration_seconds: None,
            bpm,
            musical_key: Some("Am".into()),
            duplicate_group: None,
        }
    }

    #[test]
    fn validates_reviewed_bpm_boundaries() {
        assert!(validate_bpm_range_boundaries(&[100, 120, 140]).is_ok());
        assert!(validate_bpm_range_boundaries(&[]).is_err());
        assert!(validate_bpm_range_boundaries(&[19, 120]).is_err());
        assert!(validate_bpm_range_boundaries(&[100, 100]).is_err());
        assert!(validate_bpm_range_boundaries(&[140, 120]).is_err());
        assert!(validate_bpm_range_boundaries(&[100, 301]).is_err());
        assert!(validate_bpm_range_boundaries(&[20, 40, 60, 80, 100, 120, 140, 160, 180]).is_err());
    }

    #[test]
    fn classifies_rounded_bpm_into_reviewed_ranges() {
        let boundaries = [100, 120, 140];
        assert_eq!(bpm_range_folder(Some(99.4), &boundaries), "Menos de 100 BPM");
        assert_eq!(bpm_range_folder(Some(99.6), &boundaries), "100–119 BPM");
        assert_eq!(bpm_range_folder(Some(124.0), &boundaries), "120–139 BPM");
        assert_eq!(bpm_range_folder(Some(139.6), &boundaries), "140 BPM o más");
        assert_eq!(bpm_range_folder(None, &boundaries), "BPM desconocido");
    }

    #[test]
    fn validates_custom_rule_levels() {
        assert!(validate_organization_rule_levels(&[OrganizationRuleLevel::Genre]).is_ok());
        assert!(validate_organization_rule_levels(&[
            OrganizationRuleLevel::Genre,
            OrganizationRuleLevel::Artist,
            OrganizationRuleLevel::Album,
        ])
        .is_ok());
        assert!(validate_organization_rule_levels(&[]).is_err());
        assert!(validate_organization_rule_levels(&[
            OrganizationRuleLevel::Genre,
            OrganizationRuleLevel::Genre,
        ])
        .is_err());
        assert!(validate_organization_rule_levels(&[
            OrganizationRuleLevel::Genre,
            OrganizationRuleLevel::Artist,
            OrganizationRuleLevel::Album,
            OrganizationRuleLevel::Key,
        ])
        .is_err());
    }

    #[test]
    fn builds_custom_folders_from_file_and_linked_metadata() {
        let boundaries = [100, 120, 140];
        let track = track(Some(124.0));
        let metadata = LibraryOrganizationMetadataInput {
            camelot_key: Some("8A".into()),
            release_year: Some(2024),
            subgenre: Some("Deep House".into()),
        };
        assert_eq!(
            organization_folders(
                &track,
                &OrganizationScheme::Rules,
                &[
                    OrganizationRuleLevel::Subgenre,
                    OrganizationRuleLevel::Camelot,
                    OrganizationRuleLevel::Year,
                ],
                &boundaries,
                Some(7),
                Some(&metadata),
            ),
            vec!["Deep House", "8A", "2024"]
        );
        assert_eq!(
            organization_folders(
                &track,
                &OrganizationScheme::Rules,
                &[OrganizationRuleLevel::Energy, OrganizationRuleLevel::BpmRange],
                &boundaries,
                Some(7),
                Some(&metadata),
            ),
            vec!["Energía 7", "120–139 BPM"]
        );
    }

    #[test]
    fn custom_linked_levels_use_neutral_fallbacks() {
        let track = track(None);
        assert_eq!(
            organization_folders(
                &track,
                &OrganizationScheme::Rules,
                &[
                    OrganizationRuleLevel::Subgenre,
                    OrganizationRuleLevel::Camelot,
                    OrganizationRuleLevel::Year,
                ],
                &[],
                None,
                None,
            ),
            vec![
                "Subgénero desconocido",
                "Camelot desconocido",
                "Año desconocido",
            ]
        );
    }

    #[test]
    fn combines_ranges_with_existing_presets() {
        let boundaries = [100, 120, 140];
        let track = track(Some(124.0));
        assert_eq!(
            organization_folders(
                &track,
                &OrganizationScheme::GenreBpmRange,
                &[],
                &boundaries,
                None,
                None,
            ),
            vec!["House", "120–139 BPM"]
        );
        assert_eq!(
            organization_folders(
                &track,
                &OrganizationScheme::KeyBpmRange,
                &[],
                &boundaries,
                None,
                None,
            ),
            vec!["Am", "120–139 BPM"]
        );
        assert_eq!(
            organization_folders(
                &track,
                &OrganizationScheme::EnergyBpmRange,
                &[],
                &boundaries,
                Some(7),
                None,
            ),
            vec!["Energía 7", "120–139 BPM"]
        );
    }
}
'''
text = text[:start] + new_block + text[end:]

# Invalidate all linked organization metadata that became stale after incremental scans.
text = replace_once(
    text,
    '''    if !invalid_energy_scan_ids.is_empty() {
        state
            .library_energy
            .lock()
            .map_err(|_| "No se pudo invalidar la energía vinculada anterior.".to_owned())?
            .retain(|(linked_session_id, scan_id), _| {
                linked_session_id != &session_id || !invalid_energy_scan_ids.contains(scan_id)
            });
    }''',
    '''    if !invalid_energy_scan_ids.is_empty() {
        state
            .library_energy
            .lock()
            .map_err(|_| "No se pudo invalidar la energía vinculada anterior.".to_owned())?
            .retain(|(linked_session_id, scan_id), _| {
                linked_session_id != &session_id || !invalid_energy_scan_ids.contains(scan_id)
            });
        state
            .library_organization_metadata
            .lock()
            .map_err(|_| "No se pudieron invalidar los metadatos vinculados anteriores.".to_owned())?
            .retain(|(linked_session_id, scan_id), _| {
                linked_session_id != &session_id || !invalid_energy_scan_ids.contains(scan_id)
            });
    }''',
    "incremental linked metadata invalidation",
)

# Extend linking with validated organization metadata. Existing energy parameter remains compatible.
text = replace_once(
    text,
    '''    candidates: Vec<LibraryLinkCandidate>,
    energies: HashMap<String, u8>,
) -> Result<LibraryLinkResult, String> {''',
    '''    candidates: Vec<LibraryLinkCandidate>,
    energies: HashMap<String, u8>,
    organization_metadata: Option<HashMap<String, LibraryOrganizationMetadataInput>>,
) -> Result<LibraryLinkResult, String> {''',
    "link command metadata parameter",
)
text = replace_once(
    text,
    '''    let candidate_track_ids = candidates
        .iter()
        .map(|candidate| candidate.track_id.as_str())
        .collect::<HashSet<_>>();''',
    '''    let candidate_track_ids = candidates
        .iter()
        .map(|candidate| candidate.track_id.as_str())
        .collect::<HashSet<_>>();
    let organization_metadata = organization_metadata.unwrap_or_default();''',
    "link metadata default",
)
validation_anchor = '''    if energies.len() > candidate_track_ids.len()
        || energies.iter().any(|(track_id, energy)| {
            *energy > 10 || !candidate_track_ids.contains(track_id.as_str())
        })
    {
        return Err("La energía vinculada de la biblioteca no es válida.".to_owned());
    }
'''
validation_new = validation_anchor + '''    if organization_metadata.len() > candidate_track_ids.len()
        || organization_metadata.iter().any(|(track_id, metadata)| {
            !candidate_track_ids.contains(track_id.as_str())
                || metadata.subgenre.as_ref().is_some_and(|value| {
                    let trimmed = value.trim();
                    trimmed.is_empty() || trimmed.chars().count() > 120
                })
                || metadata.camelot_key.as_ref().is_some_and(|value| {
                    let trimmed = value.trim();
                    let suffix = trimmed.chars().last();
                    let number = trimmed
                        .get(..trimmed.len().saturating_sub(1))
                        .and_then(|value| value.parse::<u8>().ok());
                    !matches!(suffix, Some('A' | 'B'))
                        || !number.is_some_and(|value| (1..=12).contains(&value))
                })
                || metadata
                    .release_year
                    .is_some_and(|value| !(1000..=9999).contains(&value))
        })
    {
        return Err("Los metadatos vinculados de la biblioteca no son válidos.".to_owned());
    }

    state
        .library_energy
        .lock()
        .map_err(|_| "No se pudo reiniciar la energía vinculada.".to_owned())?
        .retain(|(linked_session_id, _), _| linked_session_id != &session_id);
    state
        .library_organization_metadata
        .lock()
        .map_err(|_| "No se pudieron reiniciar los metadatos vinculados.".to_owned())?
        .retain(|(linked_session_id, _), _| linked_session_id != &session_id);
'''
text = replace_once(text, validation_anchor, validation_new, "linked metadata validation")
text = replace_once(
    text,
    '''    let linked_energy = links
        .iter()
        .filter_map(|link| {
            energies
                .get(&link.track_id)
                .map(|energy| (link.scan_id.clone(), *energy))
        })
        .collect::<Vec<_>>();''',
    '''    let linked_energy = links
        .iter()
        .filter_map(|link| {
            energies
                .get(&link.track_id)
                .map(|energy| (link.scan_id.clone(), *energy))
        })
        .collect::<Vec<_>>();
    let linked_organization_metadata = links
        .iter()
        .filter_map(|link| {
            organization_metadata
                .get(&link.track_id)
                .cloned()
                .map(|metadata| (link.scan_id.clone(), metadata))
        })
        .collect::<Vec<_>>();''',
    "linked metadata extraction",
)
energy_store = '''    {
        let mut library_energy = state
            .library_energy
            .lock()
            .map_err(|_| "No se pudo actualizar la energía vinculada.".to_owned())?;
        library_energy.clear();
        for (scan_id, energy) in linked_energy {
            library_energy.insert((session_id.clone(), scan_id), energy);
        }
    }'''
metadata_store = energy_store + '''
    {
        let mut linked_metadata = state
            .library_organization_metadata
            .lock()
            .map_err(|_| "No se pudieron actualizar los metadatos vinculados.".to_owned())?;
        for (scan_id, metadata) in linked_organization_metadata {
            linked_metadata.insert((session_id.clone(), scan_id), metadata);
        }
    }'''
text = replace_once(text, energy_store, metadata_store, "linked metadata storage")

# Preview/apply use the same native metadata snapshots and rule contract.
text = replace_once(
    text,
    '''    let energy_by_scan_id = linked_energy_for_session(state.inner(), &request.session_id)?;
    let current_session = state''',
    '''    let energy_by_scan_id = linked_energy_for_session(state.inner(), &request.session_id)?;
    let metadata_by_scan_id =
        linked_organization_metadata_for_session(state.inner(), &request.session_id)?;
    let current_session = state''',
    "preview metadata snapshot",
)
text = replace_once(
    text,
    '''        &request.scheme,
        &request.bpm_boundaries,
        &energy_by_scan_id,
    )?;''',
    '''        &request.scheme,
        &request.rule_levels,
        &request.bpm_boundaries,
        &energy_by_scan_id,
        &metadata_by_scan_id,
    )?;''',
    "preview rule plan",
)
apply_anchor = '''    let energy_by_scan_id = linked_energy_for_session(state.inner(), &request.session_id)?;
    let (run, result_moves) = {'''
apply_new = '''    let energy_by_scan_id = linked_energy_for_session(state.inner(), &request.session_id)?;
    let metadata_by_scan_id =
        linked_organization_metadata_for_session(state.inner(), &request.session_id)?;
    let (run, result_moves) = {'''
text = replace_once(text, apply_anchor, apply_new, "apply metadata snapshot")
text = replace_once(
    text,
    '''            &request.scheme,
            &request.bpm_boundaries,
            &energy_by_scan_id,
        )?;''',
    '''            &request.scheme,
            &request.rule_levels,
            &request.bpm_boundaries,
            &energy_by_scan_id,
            &metadata_by_scan_id,
        )?;''',
    "apply rule plan",
)
rust.write_text(text, encoding="utf-8")

Path(".github/scripts/organization_rule_builder_patch.py").unlink()
Path(".github/workflows/temporary-organization-rule-builder.yml").unlink()
