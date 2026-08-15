from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


# Frontend pure organization model.
review = Path("src/lib/desktop/scan-review.ts")
text = review.read_text(encoding="utf-8")
text = replace_once(
    text,
    '  | "genre"\n  | "genre-artist"',
    '  | "genre"\n  | "genre-subgenre"\n  | "genre-artist"',
    "genre subgenre scheme",
)
text = replace_once(
    text,
    '''export interface OrganizationPreviewOptions {
  bpmBoundaries?: readonly number[];
  energyByScanId?: ReadonlyMap<string, number>;
  linkedMetadataByScanId?: ReadonlyMap<string, LinkedOrganizationMetadata>;
  ruleLevels?: readonly (OrganizationRuleLevel | "")[];
}''',
    '''export type MissingSubgenreMode = "folder" | "exclude";

export interface OrganizationPreviewOptions {
  bpmBoundaries?: readonly number[];
  energyByScanId?: ReadonlyMap<string, number>;
  linkedMetadataByScanId?: ReadonlyMap<string, LinkedOrganizationMetadata>;
  missingSubgenreFolder?: string;
  missingSubgenreMode?: MissingSubgenreMode;
  ruleLevels?: readonly (OrganizationRuleLevel | "")[];
}''',
    "missing subgenre preview options",
)
normalize_anchor = '''export function safePathSegment(value: string | null, fallback: string) {'''
normalize_addition = '''export function normalizeMissingSubgenreFolder(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return null;
  return safePathSegment(trimmed, "Sin subgénero");
}

export function countMissingSubgenreTracks(
  tracks: readonly ScannedAudioFile[],
  linkedMetadataByScanId?: ReadonlyMap<string, LinkedOrganizationMetadata>,
) {
  return tracks.filter((track) => {
    const subgenre = linkedMetadataByScanId?.get(track.scanId)?.subgenre;
    return !subgenre?.trim();
  }).length;
}

'''+normalize_anchor
text = replace_once(text, normalize_anchor, normalize_addition, "subgenre helpers")
text = replace_once(
    text,
    '''  if (scheme === "genre") {
    return [safePathSegment(track.genre, "Género desconocido")];
  }

  if (scheme === "genre-artist") {''',
    '''  if (scheme === "genre") {
    return [safePathSegment(track.genre, "Género desconocido")];
  }

  if (scheme === "genre-subgenre") {
    const subgenre = options.linkedMetadataByScanId?.get(track.scanId)?.subgenre;
    const fallback =
      normalizeMissingSubgenreFolder(options.missingSubgenreFolder ?? "Sin subgénero") ??
      "Sin subgénero";
    return [
      safePathSegment(track.genre, "Género desconocido"),
      safePathSegment(subgenre ?? null, fallback),
    ];
  }

  if (scheme === "genre-artist") {''',
    "genre subgenre folders",
)
map_anchor = '''  return [...tracks]
    .sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, "es", {
        sensitivity: "base",
      }),
    )
    .map<OrganizationPreviewItem>((track) => {
      const folders = organizationFolders('''
map_new = '''  return [...tracks]
    .sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath, "es", {
        sensitivity: "base",
      }),
    )
    .flatMap<OrganizationPreviewItem>((track) => {
      if (
        scheme === "genre-subgenre" &&
        options.missingSubgenreMode === "exclude" &&
        !options.linkedMetadataByScanId?.get(track.scanId)?.subgenre?.trim()
      ) {
        return [];
      }
      const folders = organizationFolders('''
text = replace_once(text, map_anchor, map_new, "exclude missing subgenre preview")
text = replace_once(
    text,
    '''      return {
        sourcePath: track.relativePath,
        targetPath,
        collisionResolved: suffix > 1,
      };
    });''',
    '''      return [
        {
          sourcePath: track.relativePath,
          targetPath,
          collisionResolved: suffix > 1,
        },
      ];
    });''',
    "flat map preview return",
)
review.write_text(text, encoding="utf-8")


# Frontend tests.
tests = Path("src/lib/desktop/scan-review.test.ts")
text = tests.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  createOrganizationTree,
  filterScannedTracks,
  ORGANIZATION_TREE_PREVIEW_PATH_LIMIT,''',
    '''  countMissingSubgenreTracks,
  createOrganizationTree,
  filterScannedTracks,
  normalizeMissingSubgenreFolder,
  ORGANIZATION_TREE_PREVIEW_PATH_LIMIT,''',
    "subgenre test imports",
)
insert_anchor = '''  it("supports existing fixed schemes", () => {
    const genrePreview = createOrganizationPreview([tracks[0]], "genre")[0];'''
insert_new = '''  it("supports configurable genre/subgenre handling without inventing metadata", () => {
    const withSubgenre = new Map<string, LinkedOrganizationMetadata>([
      ["track-1", { camelotKey: null, energy: null, releaseYear: null, subgenre: "Deep House" }],
    ]);
    expect(
      createOrganizationPreview([tracks[0]], "genre-subgenre", {
        linkedMetadataByScanId: withSubgenre,
        missingSubgenreFolder: "Sin clasificar",
        missingSubgenreMode: "folder",
      })[0].targetPath,
    ).toBe("House/Deep House/Opening.mp3");
    expect(
      createOrganizationPreview([tracks[1]], "genre-subgenre", {
        linkedMetadataByScanId: withSubgenre,
        missingSubgenreFolder: "Sin clasificar",
        missingSubgenreMode: "folder",
      })[0].targetPath,
    ).toBe("Género desconocido/Sin clasificar/Closing.flac");
    expect(
      createOrganizationPreview(tracks, "genre-subgenre", {
        linkedMetadataByScanId: withSubgenre,
        missingSubgenreMode: "exclude",
      }),
    ).toHaveLength(1);
    expect(countMissingSubgenreTracks(tracks, withSubgenre)).toBe(1);
    expect(normalizeMissingSubgenreFolder("  Pendientes  ")).toBe("Pendientes");
    expect(normalizeMissingSubgenreFolder("   ")).toBeNull();
  });

'''+insert_anchor
text = replace_once(text, insert_anchor, insert_new, "genre subgenre preview tests")
tests.write_text(text, encoding="utf-8")


# Typed selector translation.
i18n = Path("src/lib/i18n/functional.ts")
text = i18n.read_text(encoding="utf-8")
text = replace_once(
    text,
    '  "Género / artista": "Genre / artist",\n',
    '  "Género / artista": "Genre / artist",\n  "Género / subgénero": "Genre / subgenre",\n',
    "genre subgenre translation",
)
i18n.write_text(text, encoding="utf-8")


# React controls and request contract.
scanner = Path("src/components/desktop/folder-scanner.tsx")
text = scanner.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''  createOrganizationPreview,
  createOrganizationTree,
  filterScannedTracks,''',
    '''  countMissingSubgenreTracks,
  createOrganizationPreview,
  createOrganizationTree,
  filterScannedTracks,''',
    "subgenre preview imports",
)
text = replace_once(
    text,
    '''  normalizeOrganizationRuleLevels,
  organizationRulesUseBpmRanges,''',
    '''  normalizeMissingSubgenreFolder,
  normalizeOrganizationRuleLevels,
  organizationRulesUseBpmRanges,''',
    "subgenre normalizer import",
)
text = replace_once(
    text,
    '''  type LinkedOrganizationMetadata,
  type OrganizationRuleLevel,''',
    '''  type LinkedOrganizationMetadata,
  type MissingSubgenreMode,
  type OrganizationRuleLevel,''',
    "subgenre type import",
)
state_anchor = '''  const [organizationRuleLevels, setOrganizationRuleLevels] = useState<
    (OrganizationRuleLevel | "")[]
  >(["genre", "", ""]);
  const [bpmBoundaryInput, setBpmBoundaryInput] = useState("");'''
state_new = '''  const [organizationRuleLevels, setOrganizationRuleLevels] = useState<
    (OrganizationRuleLevel | "")[]
  >(["genre", "", ""]);
  const [missingSubgenreMode, setMissingSubgenreMode] =
    useState<MissingSubgenreMode>("folder");
  const [missingSubgenreFolder, setMissingSubgenreFolder] = useState("Sin subgénero");
  const [confirmMissingSubgenreExclusion, setConfirmMissingSubgenreExclusion] =
    useState(false);
  const [bpmBoundaryInput, setBpmBoundaryInput] = useState("");'''
text = replace_once(text, state_anchor, state_new, "subgenre policy state")
text = replace_once(
    text,
    '''  const usesLinkedOrganizationMetadata =
    organizationScheme === "energy-bpm-range" ||
    (organizationScheme === "rules" &&''',
    '''  const usesLinkedOrganizationMetadata =
    organizationScheme === "energy-bpm-range" ||
    organizationScheme === "genre-subgenre" ||
    (organizationScheme === "rules" &&''',
    "subgenre linked metadata dependency",
)
preview_anchor = '''  const organizationPreview = useMemo(
    () =>
      createOrganizationPreview(selectedTracks, organizationScheme, {
        bpmBoundaries: bpmBoundaries ?? undefined,
        energyByScanId: linkedEnergyByScanId,
        linkedMetadataByScanId: linkedOrganizationMetadataByScanId,
        ruleLevels: organizationRuleLevels,
      }),'''
preview_new = '''  const normalizedMissingSubgenreFolder = normalizeMissingSubgenreFolder(
    missingSubgenreFolder,
  );
  const missingSubgenreCount = useMemo(
    () => countMissingSubgenreTracks(selectedTracks, linkedOrganizationMetadataByScanId),
    [linkedOrganizationMetadataByScanId, selectedTracks],
  );
  const organizationPreview = useMemo(
    () =>
      createOrganizationPreview(selectedTracks, organizationScheme, {
        bpmBoundaries: bpmBoundaries ?? undefined,
        energyByScanId: linkedEnergyByScanId,
        linkedMetadataByScanId: linkedOrganizationMetadataByScanId,
        missingSubgenreFolder,
        missingSubgenreMode,
        ruleLevels: organizationRuleLevels,
      }),'''
text = replace_once(text, preview_anchor, preview_new, "subgenre preview configuration")
text = replace_once(
    text,
    '''      linkedOrganizationMetadataByScanId,
      organizationRuleLevels,
      organizationScheme,
      selectedTracks,''',
    '''      linkedOrganizationMetadataByScanId,
      missingSubgenreFolder,
      missingSubgenreMode,
      organizationRuleLevels,
      organizationScheme,
      selectedTracks,''',
    "subgenre preview dependencies",
)
ready_anchor = '''  const organizationConfigurationReady =
    organizationRulesValid &&
    (!usesBpmRanges || Boolean(bpmBoundaries)) &&
    (!usesLinkedOrganizationMetadata || organizationMetadataReady);'''
ready_new = '''  const genreSubgenrePolicyReady =
    organizationScheme !== "genre-subgenre" ||
    (missingSubgenreMode === "folder"
      ? Boolean(normalizedMissingSubgenreFolder)
      : missingSubgenreCount === 0 || confirmMissingSubgenreExclusion);
  const organizationConfigurationReady =
    organizationRulesValid &&
    genreSubgenrePolicyReady &&
    (!usesBpmRanges || Boolean(bpmBoundaries)) &&
    (!usesLinkedOrganizationMetadata || organizationMetadataReady);'''
text = replace_once(text, ready_anchor, ready_new, "subgenre readiness")
run_anchor = '''    if (!organizationRulesValid) {
      setReorganizationMessage('''
run_new = '''    if (!genreSubgenrePolicyReady) {
      setReorganizationMessage(
        missingSubgenreMode === "exclude"
          ? locale === "en"
            ? "Confirm the exclusion of tracks without subgenre before simulating the plan."
            : "Confirma la exclusión de las pistas sin subgénero antes de simular el plan."
          : locale === "en"
            ? "Enter a valid neutral folder name for tracks without subgenre."
            : "Introduce un nombre válido para la carpeta neutral de pistas sin subgénero.",
      );
      return;
    }
    if (!organizationRulesValid) {
      setReorganizationMessage('''
text = replace_once(text, run_anchor, run_new, "subgenre run guard")
request_anchor = '''            bpmBoundaries: usesBpmRanges ? bpmBoundaries ?? [] : [],
            ruleLevels:
              organizationScheme === "rules"
                ? normalizedOrganizationRuleLevels ?? []
                : [],
            scheme: organizationScheme,'''
request_new = '''            bpmBoundaries: usesBpmRanges ? bpmBoundaries ?? [] : [],
            confirmMissingSubgenreExclusion:
              organizationScheme === "genre-subgenre" &&
              missingSubgenreMode === "exclude" &&
              confirmMissingSubgenreExclusion,
            missingSubgenreFolder:
              organizationScheme === "genre-subgenre" && missingSubgenreMode === "folder"
                ? normalizedMissingSubgenreFolder
                : null,
            missingSubgenreMode:
              organizationScheme === "genre-subgenre" ? missingSubgenreMode : "folder",
            ruleLevels:
              organizationScheme === "rules"
                ? normalizedOrganizationRuleLevels ?? []
                : [],
            scheme: organizationScheme,'''
text = replace_once(text, request_anchor, request_new, "native subgenre policy request")
text = replace_once(
    text,
    '                        <option value="genre">{t("Género")}</option>\n                        <option value="genre-artist">',
    '                        <option value="genre">{t("Género")}</option>\n                        <option value="genre-subgenre">{t("Género / subgénero")}</option>\n                        <option value="genre-artist">',
    "genre subgenre selector option",
)
ui_anchor = '''                  {organizationScheme === "rules" ? (
                    <div className="organization-rule-builder">'''
ui_new = '''                  {organizationScheme === "genre-subgenre" ? (
                    <div className="organization-rule-builder">
                      <label>
                        {locale === "en" ? "Tracks without subgenre" : "Pistas sin subgénero"}
                        <select
                          onChange={(event) => {
                            setMissingSubgenreMode(event.target.value as MissingSubgenreMode);
                            setConfirmMissingSubgenreExclusion(false);
                          }}
                          value={missingSubgenreMode}
                        >
                          <option value="folder">
                            {locale === "en" ? "Use a neutral folder" : "Usar carpeta neutral"}
                          </option>
                          <option value="exclude">
                            {locale === "en" ? "Exclude with confirmation" : "Excluir con confirmación"}
                          </option>
                        </select>
                      </label>
                      {missingSubgenreMode === "folder" ? (
                        <label>
                          {locale === "en" ? "Neutral folder name" : "Nombre de carpeta neutral"}
                          <input
                            aria-invalid={!normalizedMissingSubgenreFolder}
                            maxLength={80}
                            onChange={(event) => setMissingSubgenreFolder(event.target.value)}
                            value={missingSubgenreFolder}
                          />
                        </label>
                      ) : missingSubgenreCount ? (
                        <label>
                          <input
                            checked={confirmMissingSubgenreExclusion}
                            onChange={(event) =>
                              setConfirmMissingSubgenreExclusion(event.target.checked)
                            }
                            type="checkbox"
                          />
                          {locale === "en"
                            ? `Confirm exclusion of ${missingSubgenreCount.toLocaleString(locale)} tracks without subgenre`
                            : `Confirmo excluir ${missingSubgenreCount.toLocaleString(locale)} pistas sin subgénero`}
                        </label>
                      ) : null}
                      <small>
                        {locale === "en"
                          ? `${missingSubgenreCount.toLocaleString(locale)} selected tracks currently have no linked subgenre.`
                          : `${missingSubgenreCount.toLocaleString(locale)} pistas seleccionadas no tienen subgénero vinculado.`}
                      </small>
                    </div>
                  ) : null}
                  {organizationScheme === "rules" ? (
                    <div className="organization-rule-builder">'''
text = replace_once(text, ui_anchor, ui_new, "genre subgenre policy controls")
scanner.write_text(text, encoding="utf-8")


# Native contract.
rust = Path("src-tauri/src/lib.rs")
text = rust.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''enum OrganizationScheme {
    ArtistAlbum,
    Genre,
    GenreArtist,''',
    '''enum OrganizationScheme {
    ArtistAlbum,
    Genre,
    GenreSubgenre,
    GenreArtist,''',
    "native genre subgenre scheme",
)
rule_enum_anchor = '''enum OrganizationRuleLevel {
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
}
'''
rule_enum_new = rule_enum_anchor + '''
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum MissingSubgenreMode {
    #[default]
    Folder,
    Exclude,
}
'''
text = replace_once(text, rule_enum_anchor, rule_enum_new, "native missing subgenre mode")
text = replace_once(
    text,
    '''struct ReorganizationRequest {
    #[serde(default)]
    bpm_boundaries: Vec<u16>,
    #[serde(default)]
    rule_levels: Vec<OrganizationRuleLevel>,
    scheme: OrganizationScheme,
    session_id: String,
    track_ids: Vec<String>,
}''',
    '''struct ReorganizationRequest {
    #[serde(default)]
    bpm_boundaries: Vec<u16>,
    #[serde(default)]
    confirm_missing_subgenre_exclusion: bool,
    #[serde(default)]
    missing_subgenre_folder: Option<String>,
    #[serde(default)]
    missing_subgenre_mode: MissingSubgenreMode,
    #[serde(default)]
    rule_levels: Vec<OrganizationRuleLevel>,
    scheme: OrganizationScheme,
    session_id: String,
    track_ids: Vec<String>,
}''',
    "native subgenre request fields",
)
text = replace_once(
    text,
    '''fn organization_folders(
    track: &ScannedAudioFile,
    scheme: &OrganizationScheme,
    rule_levels: &[OrganizationRuleLevel],
    bpm_boundaries: &[u16],
    energy: Option<u8>,
    metadata: Option<&LibraryOrganizationMetadataInput>,
) -> Vec<String> {''',
    '''fn organization_folders(
    track: &ScannedAudioFile,
    scheme: &OrganizationScheme,
    rule_levels: &[OrganizationRuleLevel],
    bpm_boundaries: &[u16],
    energy: Option<u8>,
    metadata: Option<&LibraryOrganizationMetadataInput>,
    missing_subgenre_folder: &str,
) -> Vec<String> {''',
    "native folder signature",
)
text = replace_once(
    text,
    '''        OrganizationScheme::Genre => vec![safe_path_segment(
            track.genre.as_deref(),
            "Género desconocido",
        )],
        OrganizationScheme::GenreArtist => vec![''',
    '''        OrganizationScheme::Genre => vec![safe_path_segment(
            track.genre.as_deref(),
            "Género desconocido",
        )],
        OrganizationScheme::GenreSubgenre => vec![
            safe_path_segment(track.genre.as_deref(), "Género desconocido"),
            safe_path_segment(
                metadata.and_then(|value| value.subgenre.as_deref()),
                missing_subgenre_folder,
            ),
        ],
        OrganizationScheme::GenreArtist => vec![''',
    "native genre subgenre folders",
)
text = replace_once(
    text,
    '''    metadata_by_scan_id: &HashMap<String, LibraryOrganizationMetadataInput>,
) -> Result<Vec<AppliedMove>, String> {''',
    '''    metadata_by_scan_id: &HashMap<String, LibraryOrganizationMetadataInput>,
    missing_subgenre_mode: &MissingSubgenreMode,
    missing_subgenre_folder: Option<&str>,
    confirm_missing_subgenre_exclusion: bool,
) -> Result<Vec<AppliedMove>, String> {''',
    "native builder policy signature",
)
selected_anchor = '''    let selected = selected_session_tracks_from_session(session, track_ids)?;
    let mut used_targets = HashSet::with_capacity(selected.len());'''
selected_new = '''    let selected = selected_session_tracks_from_session(session, track_ids)?;
    let mut neutral_subgenre_folder = "Sin subgénero".to_owned();
    if matches!(scheme, OrganizationScheme::GenreSubgenre) {
        match missing_subgenre_mode {
            MissingSubgenreMode::Folder => {
                let configured = missing_subgenre_folder.unwrap_or("Sin subgénero").trim();
                if configured.is_empty() || configured.chars().count() > 80 {
                    return Err("Configura un nombre válido para la carpeta neutral de subgénero.".to_owned());
                }
                neutral_subgenre_folder = safe_path_segment(Some(configured), "Sin subgénero");
            }
            MissingSubgenreMode::Exclude => {
                let has_missing = selected.iter().any(|session_track| {
                    metadata_by_scan_id
                        .get(&session_track.track.scan_id)
                        .and_then(|value| value.subgenre.as_deref())
                        .is_none_or(|value| value.trim().is_empty())
                });
                if has_missing && !confirm_missing_subgenre_exclusion {
                    return Err("Confirma la exclusión de las pistas sin subgénero.".to_owned());
                }
            }
        }
    }
    let mut used_targets = HashSet::with_capacity(selected.len());'''
text = replace_once(text, selected_anchor, selected_new, "native policy validation")
loop_anchor = '''        let energy = energy_by_scan_id.get(&session_track.track.scan_id).copied();
        let metadata = metadata_by_scan_id.get(&session_track.track.scan_id);
        let folders = organization_folders('''
loop_new = '''        let energy = energy_by_scan_id.get(&session_track.track.scan_id).copied();
        let metadata = metadata_by_scan_id.get(&session_track.track.scan_id);
        if matches!(scheme, OrganizationScheme::GenreSubgenre)
            && matches!(missing_subgenre_mode, MissingSubgenreMode::Exclude)
            && metadata
                .and_then(|value| value.subgenre.as_deref())
                .is_none_or(|value| value.trim().is_empty())
        {
            continue;
        }
        let folders = organization_folders('''
text = replace_once(text, loop_anchor, loop_new, "native exclude missing subgenre")
text = replace_once(
    text,
    '''            bpm_boundaries,
            energy,
            metadata,
        );''',
    '''            bpm_boundaries,
            energy,
            metadata,
            &neutral_subgenre_folder,
        );''',
    "native folder policy argument",
)
# Default wrapper preserves existing schemes.
text = replace_once(
    text,
    '''        &HashMap::new(),
        &HashMap::new(),
    )''',
    '''        &HashMap::new(),
        &HashMap::new(),
        &MissingSubgenreMode::Folder,
        None,
        false,
    )''',
    "native default builder policy",
)
# Preview and apply pass policy.
preview_call = '''        &request.bpm_boundaries,
        &energy_by_scan_id,
        &metadata_by_scan_id,
    )?;'''
preview_new = '''        &request.bpm_boundaries,
        &energy_by_scan_id,
        &metadata_by_scan_id,
        &request.missing_subgenre_mode,
        request.missing_subgenre_folder.as_deref(),
        request.confirm_missing_subgenre_exclusion,
    )?;'''
if text.count(preview_call) != 1:
    raise SystemExit("preview policy call anchor not found")
text = text.replace(preview_call, preview_new, 1)
apply_call = '''            &request.bpm_boundaries,
            &energy_by_scan_id,
            &metadata_by_scan_id,
        )?;'''
apply_new = '''            &request.bpm_boundaries,
            &energy_by_scan_id,
            &metadata_by_scan_id,
            &request.missing_subgenre_mode,
            request.missing_subgenre_folder.as_deref(),
            request.confirm_missing_subgenre_exclusion,
        )?;'''
if text.count(apply_call) != 1:
    raise SystemExit("apply policy call anchor not found")
text = text.replace(apply_call, apply_new, 1)
# Existing direct test calls gain neutral fallback argument.
text = text.replace('                Some(&metadata),\n            ),', '                Some(&metadata),\n                "Sin subgénero",\n            ),')
text = text.replace('                None,\n            ),', '                None,\n                "Sin subgénero",\n            ),')
# Add focused native tests before end of organization test module.
test_anchor = '''    fn combines_ranges_with_existing_presets() {'''
new_test = '''    #[test]
    fn genre_subgenre_uses_configured_neutral_folder_without_inventing_metadata() {
        let track = track(Some(124.0));
        assert_eq!(
            organization_folders(
                &track,
                &OrganizationScheme::GenreSubgenre,
                &[],
                &[],
                None,
                None,
                "Pendientes",
            ),
            vec!["House", "Pendientes"]
        );
    }

    #[test]
'''+test_anchor
text = replace_once(text, '#[test]\n    fn combines_ranges_with_existing_presets() {', new_test, "native subgenre test")
rust.write_text(text, encoding="utf-8")


# Roadmap synchronization.
roadmap = Path("docs/roadmap.md")
text = roadmap.read_text(encoding="utf-8")
text = replace_once(
    text,
    '''7. - [ ] Añadir la organización física género/subgénero después de estabilizar el
   nuevo campo. Las pistas sin subgénero deben permanecer visibles en la
   previsualización y usar una carpeta neutral configurable o quedar excluidas
   mediante confirmación; nunca se inventarán coincidencias.''',
    '''7. - [x] Añadir la organización física género/subgénero después de estabilizar el
   nuevo campo. El preset reutiliza únicamente subgéneros vinculados a coincidencias
   locales confirmadas. Las pistas sin subgénero permanecen visibles en la
   previsualización y, por defecto, usan una carpeta neutral configurable; también
   pueden excluirse mediante confirmación explícita. Tauri vuelve a validar la
   política y nunca inventa coincidencias antes de mover archivos.''',
    "roadmap genre subgenre item",
)
roadmap.write_text(text, encoding="utf-8")

Path(".github/scripts/genre_subgenre_patch.py").unlink()
Path(".github/workflows/temporary-genre-subgenre.yml").unlink()
