from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"{label} anchor not found")
    return text.replace(old, new, 1)


actions = Path("src/app/import/actions.ts")
text = actions.read_text(encoding="utf-8")
text = replace_once(
    text,
    "export type DesktopLibraryLinkCandidate = {\n  fileFingerprint: string;\n  fileSize: number;\n  trackId: string;\n};",
    "export type DesktopLibraryLinkCandidate = {\n  energy: number | null;\n  fileFingerprint: string;\n  fileSize: number;\n  trackId: string;\n};",
    "desktop library candidate type",
)
text = replace_once(
    text,
    '.select("id, file_fingerprint, file_size", { count: "exact" })',
    '.select("id, file_fingerprint, file_size, energy", { count: "exact" })',
    "desktop library candidate select",
)
text = replace_once(
    text,
    "          {\n            fileFingerprint: track.file_fingerprint,\n            fileSize: track.file_size,\n            trackId: track.id,\n          },",
    "          {\n            energy:\n              track.energy !== null &&\n              Number.isInteger(track.energy) &&\n              track.energy >= 0 &&\n              track.energy <= 10\n                ? track.energy\n                : null,\n            fileFingerprint: track.file_fingerprint,\n            fileSize: track.file_size,\n            trackId: track.id,\n          },",
    "desktop library candidate mapping",
)
actions.write_text(text, encoding="utf-8")

scanner = Path("src/components/desktop/folder-scanner.tsx")
text = scanner.read_text(encoding="utf-8")
text = replace_once(
    text,
    "  createOrganizationPreview,\n  filterScannedTracks,\n  paginateScannedTracks,\n  type OrganizationScheme,",
    "  createOrganizationPreview,\n  filterScannedTracks,\n  organizationSchemeUsesBpmRanges,\n  paginateScannedTracks,\n  parseBpmRangeBoundaries,\n  type OrganizationScheme,",
    "scan review imports",
)
text = replace_once(
    text,
    "  const [linkedScanIds, setLinkedScanIds] = useState<Set<string>>(\n    () => new Set(),\n  );",
    "  const [linkedScanIds, setLinkedScanIds] = useState<Set<string>>(\n    () => new Set(),\n  );\n  const [linkedEnergyByScanId, setLinkedEnergyByScanId] = useState<\n    Map<string, number>\n  >(() => new Map());",
    "linked energy state",
)
text = replace_once(
    text,
    '  const [organizationScheme, setOrganizationScheme] =\n    useState<OrganizationScheme>("artist-album");',
    '  const [organizationScheme, setOrganizationScheme] =\n    useState<OrganizationScheme>("artist-album");\n  const [bpmBoundaryInput, setBpmBoundaryInput] = useState("");',
    "BPM boundary state",
)
text = replace_once(
    text,
    "  const organizationPreview = useMemo(\n    () => createOrganizationPreview(selectedTracks, organizationScheme),\n    [organizationScheme, selectedTracks],\n  );",
    "  const bpmBoundaries = useMemo(\n    () => parseBpmRangeBoundaries(bpmBoundaryInput),\n    [bpmBoundaryInput],\n  );\n  const usesBpmRanges = organizationSchemeUsesBpmRanges(organizationScheme);\n  const organizationPreview = useMemo(\n    () =>\n      createOrganizationPreview(selectedTracks, organizationScheme, {\n        bpmBoundaries: bpmBoundaries ?? undefined,\n        energyByScanId: linkedEnergyByScanId,\n      }),\n    [bpmBoundaries, linkedEnergyByScanId, organizationScheme, selectedTracks],\n  );",
    "organization preview options",
)
text = replace_once(
    text,
    "      clearTrackLinks();\n      setLibraryLinkMessage(",
    "      clearTrackLinks();\n      setLinkedEnergyByScanId(new Map());\n      setLibraryLinkMessage(",
    "clear linked energy",
)
text = replace_once(
    text,
    '''        const linkResult = await core.invoke<LibraryLinkResult>(
          "link_library_tracks",
          {
            sessionId: scanResult.sessionId,
            candidates: library.candidates,
          },
        );
        setLinkedScanIds(new Set(linkResult.links.map((link) => link.scanId)));
        replaceTrackLinks(scanResult.sessionId, linkResult.links);''',
    '''        const energyByTrackId = new Map(
          library.candidates.flatMap((candidate) =>
            candidate.energy === null
              ? []
              : [[candidate.trackId, candidate.energy] as const],
          ),
        );
        const linkResult = await core.invoke<LibraryLinkResult>(
          "link_library_tracks",
          {
            sessionId: scanResult.sessionId,
            candidates: library.candidates.map((candidate) => ({
              fileFingerprint: candidate.fileFingerprint,
              fileSize: candidate.fileSize,
              trackId: candidate.trackId,
            })),
            energies: Object.fromEntries(energyByTrackId),
          },
        );
        setLinkedScanIds(new Set(linkResult.links.map((link) => link.scanId)));
        setLinkedEnergyByScanId(
          new Map(
            linkResult.links.flatMap((link) => {
              const energy = energyByTrackId.get(link.trackId);
              return energy === undefined ? [] : [[link.scanId, energy] as const];
            }),
          ),
        );
        replaceTrackLinks(scanResult.sessionId, linkResult.links);''',
    "library link invocation",
)
text = replace_once(
    text,
    "    if (!core || !result || !selectedTracks.length) return;\n    if (\n      apply &&",
    '''    if (!core || !result || !selectedTracks.length) return;
    if (usesBpmRanges && !bpmBoundaries) {
      setReorganizationMessage(
        locale === "en"
          ? "Enter between 1 and 8 increasing whole-number BPM cut points from 20 to 300 before simulating the plan."
          : "Introduce entre 1 y 8 cortes BPM enteros, ascendentes y entre 20 y 300 antes de simular el plan.",
      );
      return;
    }
    if (
      apply &&''',
    "reorganization BPM validation",
)
text = replace_once(
    text,
    '''          request: {
            scheme: organizationScheme,
            sessionId: result.sessionId,
            trackIds: selectedTracks.map((track) => track.scanId),
          },''',
    '''          request: {
            bpmBoundaries: usesBpmRanges ? bpmBoundaries ?? [] : [],
            scheme: organizationScheme,
            sessionId: result.sessionId,
            trackIds: selectedTracks.map((track) => track.scanId),
          },''',
    "reorganization request boundaries",
)
text = replace_once(
    text,
    "              {organizationPreview.length ? (",
    "              {selectedTracks.length ? (",
    "reorganization section visibility",
)
text = replace_once(
    text,
    '                        <option value="genre-artist">{t("Género / artista")}</option>\n                        <option value="key-bpm">{t("Tonalidad / BPM")}</option>',
    '                        <option value="genre-artist">{t("Género / artista")}</option>\n                        <option value="key-bpm">{t("Tonalidad / BPM")}</option>\n                        <option value="bpm-range">{t("Rango de BPM")}</option>\n                        <option value="genre-bpm-range">{t("Género / rango de BPM")}</option>\n                        <option value="energy-bpm-range">{t("Energía / rango de BPM")}</option>\n                        <option value="key-bpm-range">{t("Tonalidad / rango de BPM")}</option>',
    "BPM range selector options",
)
heading_end = '''                  </div>
                  <p className="organization-muted">
                    {locale === "en"
                      ? `These paths are a safe proposal for ${organizationPreview.length.toLocaleString(locale)} tracks. The native simulation rechecks external changes and collisions immediately before applying the batch.`
                      : `Estas rutas son una propuesta segura para ${organizationPreview.length.toLocaleString(locale)} pistas. La simulación nativa vuelve a comprobar cambios externos y colisiones justo antes de aplicar el lote.`}
                  </p>'''
heading_new = '''                  </div>
                  {usesBpmRanges ? (
                    <label>
                      {t("Cortes de BPM")}
                      <input
                        aria-invalid={Boolean(bpmBoundaryInput.trim()) && !bpmBoundaries}
                        inputMode="numeric"
                        onChange={(event) => setBpmBoundaryInput(event.target.value)}
                        placeholder="100, 120, 130, 140"
                        value={bpmBoundaryInput}
                      />
                      <small>
                        {locale === "en"
                          ? "Enter 1–8 increasing whole-number cut points from 20 to 300. The limits are reviewed here before any native simulation or move."
                          : "Introduce 1–8 cortes enteros y ascendentes entre 20 y 300. Los límites se revisan aquí antes de cualquier simulación o movimiento nativo."}
                      </small>
                    </label>
                  ) : null}
                  <p className="organization-muted">
                    {usesBpmRanges && !bpmBoundaries
                      ? locale === "en"
                        ? "Enter valid BPM cut points to generate the organization preview."
                        : "Introduce cortes BPM válidos para generar la previsualización de organización."
                      : locale === "en"
                        ? `These paths are a safe proposal for ${organizationPreview.length.toLocaleString(locale)} tracks. The native simulation rechecks external changes and collisions immediately before applying the batch.`
                        : `Estas rutas son una propuesta segura para ${organizationPreview.length.toLocaleString(locale)} pistas. La simulación nativa vuelve a comprobar cambios externos y colisiones justo antes de aplicar el lote.`}
                  </p>'''
text = replace_once(text, heading_end, heading_new, "BPM range controls")
text = text.replace(
    "disabled={reorganizationBusy}",
    "disabled={reorganizationBusy || (usesBpmRanges && !bpmBoundaries)}",
    2,
)
scanner.write_text(text, encoding="utf-8")

rust = Path("src-tauri/src/lib.rs")
text = rust.read_text(encoding="utf-8")
text = replace_once(
    text,
    "enum OrganizationScheme {\n    ArtistAlbum,\n    Genre,\n    GenreArtist,\n    KeyBpm,\n}",
    "enum OrganizationScheme {\n    ArtistAlbum,\n    Genre,\n    GenreArtist,\n    KeyBpm,\n    BpmRange,\n    GenreBpmRange,\n    EnergyBpmRange,\n    KeyBpmRange,\n}",
    "Rust organization scheme",
)
text = replace_once(
    text,
    "struct ReorganizationRequest {\n    scheme: OrganizationScheme,\n    session_id: String,\n    track_ids: Vec<String>,\n}",
    "struct ReorganizationRequest {\n    #[serde(default)]\n    bpm_boundaries: Vec<u16>,\n    scheme: OrganizationScheme,\n    session_id: String,\n    track_ids: Vec<String>,\n}",
    "Rust reorganization request",
)
text = replace_once(
    text,
    "struct DesktopState {\n    active_track_analyses: Mutex<HashMap<String, ActiveTrackAnalysis>>,\n    active_maest_analyses: Mutex<HashMap<String, ActiveMaestAnalysis>>,",
    "struct DesktopState {\n    active_track_analyses: Mutex<HashMap<String, ActiveTrackAnalysis>>,\n    active_maest_analyses: Mutex<HashMap<String, ActiveMaestAnalysis>>,\n    library_energy: Mutex<HashMap<(String, String), u8>>,",
    "Rust desktop energy state",
)

start = text.index("fn organization_folders(")
end = text.index("\nfn selected_session_tracks_from_session(", start)
new_block = r'''fn organization_scheme_uses_bpm_ranges(scheme: &OrganizationScheme) -> bool {
    matches!(
        scheme,
        OrganizationScheme::BpmRange
            | OrganizationScheme::GenreBpmRange
            | OrganizationScheme::EnergyBpmRange
            | OrganizationScheme::KeyBpmRange
    )
}

fn validate_bpm_range_boundaries(boundaries: &[u16]) -> Result<(), String> {
    if boundaries.is_empty() || boundaries.len() > 8 {
        return Err("Configura entre 1 y 8 cortes de BPM.".to_owned());
    }
    if boundaries.iter().any(|value| !(20..=300).contains(value)) {
        return Err("Los cortes de BPM deben estar entre 20 y 300.".to_owned());
    }
    if boundaries.windows(2).any(|window| window[0] >= window[1]) {
        return Err("Los cortes de BPM deben estar en orden ascendente y sin duplicados.".to_owned());
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

fn organization_folders(
    track: &ScannedAudioFile,
    scheme: &OrganizationScheme,
    bpm_boundaries: &[u16],
    energy: Option<u8>,
) -> Vec<String> {
    match scheme {
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

fn build_reorganization_plan_with_options(
    session: &ScanSession,
    track_ids: &[String],
    scheme: &OrganizationScheme,
    bpm_boundaries: &[u16],
    energy_by_scan_id: &HashMap<String, u8>,
) -> Result<Vec<AppliedMove>, String> {
    if organization_scheme_uses_bpm_ranges(scheme) {
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
        let folders = organization_folders(
            &session_track.track,
            scheme,
            bpm_boundaries,
            energy,
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
    build_reorganization_plan_with_options(session, track_ids, scheme, &[], &HashMap::new())
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
    fn combines_ranges_with_genre_key_and_linked_energy() {
        let boundaries = [100, 120, 140];
        let track = track(Some(124.0));
        assert_eq!(
            organization_folders(&track, &OrganizationScheme::GenreBpmRange, &boundaries, None),
            vec!["House", "120–139 BPM"]
        );
        assert_eq!(
            organization_folders(&track, &OrganizationScheme::KeyBpmRange, &boundaries, None),
            vec!["Am", "120–139 BPM"]
        );
        assert_eq!(
            organization_folders(&track, &OrganizationScheme::EnergyBpmRange, &boundaries, Some(7)),
            vec!["Energía 7", "120–139 BPM"]
        );
        assert_eq!(
            organization_folders(&track, &OrganizationScheme::EnergyBpmRange, &boundaries, None),
            vec!["Energía desconocida", "120–139 BPM"]
        );
    }
}
'''
text = text[:start] + new_block + text[end:]

text = replace_once(
    text,
    '''async fn link_library_tracks(
    app: AppHandle,
    state: State<'_, DesktopState>,
    session_id: String,
    candidates: Vec<LibraryLinkCandidate>,
) -> Result<LibraryLinkResult, String> {''',
    '''async fn link_library_tracks(
    app: AppHandle,
    state: State<'_, DesktopState>,
    session_id: String,
    candidates: Vec<LibraryLinkCandidate>,
    energies: HashMap<String, u8>,
) -> Result<LibraryLinkResult, String> {''',
    "link command signature",
)
link_start = text.index("async fn link_library_tracks(")
alias_marker = '''    let alias_path = app
        .path()
        .app_data_dir()
        .map_err(|_| "No se pudo abrir el estado local de vínculos.".to_owned())?
        .join(LIBRARY_FILE_ALIASES_NAME);'''
alias_index = text.index(alias_marker, link_start)
validation = '''
    let candidate_track_ids = candidates
        .iter()
        .map(|candidate| candidate.track_id.as_str())
        .collect::<HashSet<_>>();
    if energies.len() > candidate_track_ids.len()
        || energies.iter().any(|(track_id, energy)| {
            *energy > 10 || !candidate_track_ids.contains(track_id.as_str())
        })
    {
        return Err("La energía vinculada de la biblioteca no es válida.".to_owned());
    }
'''
insert_at = alias_index + len(alias_marker)
text = text[:insert_at] + validation + text[insert_at:]
text = replace_once(
    text,
    "    let linked_tracks = links.len();\n    update_alias_anchors(&mut alias_store, &candidates, matches.links.keys().cloned());",
    '''    let linked_tracks = links.len();
    let linked_energy = links
        .iter()
        .filter_map(|link| {
            energies
                .get(&link.track_id)
                .map(|energy| (link.scan_id.clone(), *energy))
        })
        .collect::<Vec<_>>();
    update_alias_anchors(&mut alias_store, &candidates, matches.links.keys().cloned());''',
    "linked energy extraction",
)
text = replace_once(
    text,
    '''    session.library_links = matches.links;
    drop(current_session);
    state
        .pending_maest_genre_previews''',
    '''    session.library_links = matches.links;
    drop(current_session);
    {
        let mut library_energy = state
            .library_energy
            .lock()
            .map_err(|_| "No se pudo actualizar la energía vinculada.".to_owned())?;
        library_energy.clear();
        for (scan_id, energy) in linked_energy {
            library_energy.insert((session_id.clone(), scan_id), energy);
        }
    }
    state
        .pending_maest_genre_previews''',
    "linked energy persistence",
)

incremental_anchor = '''    session.file_versions = completed.file_versions;
    session.tracks = tracks;
    session.truncated = false;
    drop(current_session);
    state
        .pending_maest_genre_previews'''
incremental_replacement = '''    session.file_versions = completed.file_versions;
    session.tracks = tracks;
    session.truncated = false;
    drop(current_session);
    let invalid_energy_scan_ids = removed_scan_ids
        .iter()
        .chain(updated_scan_ids.iter())
        .cloned()
        .collect::<HashSet<_>>();
    if !invalid_energy_scan_ids.is_empty() {
        state
            .library_energy
            .lock()
            .map_err(|_| "No se pudo invalidar la energía vinculada anterior.".to_owned())?
            .retain(|(linked_session_id, scan_id), _| {
                linked_session_id != &session_id || !invalid_energy_scan_ids.contains(scan_id)
            });
    }
    state
        .pending_maest_genre_previews'''
text = replace_once(text, incremental_anchor, incremental_replacement, "incremental energy invalidation")

text = replace_once(
    text,
    '''async fn preview_reorganization_plan(
    state: State<'_, DesktopState>,
    request: ReorganizationRequest,
) -> Result<ReorganizationResult, String> {
    let current_session = state''',
    '''async fn preview_reorganization_plan(
    state: State<'_, DesktopState>,
    request: ReorganizationRequest,
) -> Result<ReorganizationResult, String> {
    let energy_by_scan_id = linked_energy_for_session(state.inner(), &request.session_id)?;
    let current_session = state''',
    "preview energy snapshot",
)
text = replace_once(
    text,
    "    let moves = build_reorganization_plan(session, &request.track_ids, &request.scheme)?;",
    '''    let moves = build_reorganization_plan_with_options(
        session,
        &request.track_ids,
        &request.scheme,
        &request.bpm_boundaries,
        &energy_by_scan_id,
    )?;''',
    "preview range plan",
)
text = replace_once(
    text,
    '''async fn apply_reorganization_plan(
    state: State<'_, DesktopState>,
    request: ReorganizationRequest,
) -> Result<ReorganizationResult, String> {
    let (run, result_moves) = {''',
    '''async fn apply_reorganization_plan(
    state: State<'_, DesktopState>,
    request: ReorganizationRequest,
) -> Result<ReorganizationResult, String> {
    let energy_by_scan_id = linked_energy_for_session(state.inner(), &request.session_id)?;
    let (run, result_moves) = {''',
    "apply energy snapshot",
)
text = replace_once(
    text,
    "        let moves = build_reorganization_plan(session, &request.track_ids, &request.scheme)?;",
    '''        let moves = build_reorganization_plan_with_options(
            session,
            &request.track_ids,
            &request.scheme,
            &request.bpm_boundaries,
            &energy_by_scan_id,
        )?;''',
    "apply range plan",
)
rust.write_text(text, encoding="utf-8")

Path(".github/scripts/bpm_range_patch.py").unlink()
Path(".github/workflows/temporary-bpm-range-patch.yml").unlink()
