use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use super::{
    file_version, hash_file, parse_library_fingerprint, persist_local_aliases, read_audio_metadata,
    read_local_alias_store, valid_library_track_id, DesktopState, FileVersion, LibraryTrackLink,
    LocalFileIdentity, ScanSession, SessionTrack, MAX_SAFE_JSON_INTEGER,
};

pub(super) const MAX_REPAIR_TRACKS: usize = 25;
const MAX_CANDIDATES_PER_TRACK: usize = 3;
const MIN_REPAIR_CONFIDENCE: u8 = 70;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LostTrackRepairLibraryTrack {
    pub(super) album: Option<String>,
    pub(super) artist: Option<String>,
    pub(super) duration_seconds: Option<f64>,
    pub(super) file_fingerprint: String,
    pub(super) file_size: u64,
    pub(super) genre: Option<String>,
    pub(super) title: String,
    pub(super) track_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct LostTrackRepairSelection {
    pub(super) scan_id: String,
    pub(super) track_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LostTrackRepairCandidate {
    pub(super) confidence: u8,
    pub(super) reasons: Vec<&'static str>,
    pub(super) relative_path: String,
    pub(super) scan_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LostTrackRepairTrackPreview {
    pub(super) candidates: Vec<LostTrackRepairCandidate>,
    pub(super) title: String,
    pub(super) track_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LostTrackRepairPreview {
    pub(super) tracks: Vec<LostTrackRepairTrackPreview>,
    pub(super) unresolved_track_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LostTrackRepairApplyResult {
    pub(super) links: Vec<LibraryTrackLink>,
}

#[derive(Clone, Debug)]
pub(super) struct LostTrackRepairReceipt {
    anchor: LocalFileIdentity,
    file_version: FileVersion,
    fingerprint: [u8; 32],
    session_id: String,
}

#[derive(Debug)]
struct ScoredCandidate {
    confidence: u8,
    fingerprint: [u8; 32],
    reasons: Vec<&'static str>,
    track: SessionTrack,
    version: FileVersion,
}

fn normalized(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    Some(
        value
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase(),
    )
}

fn same_text(left: Option<&str>, right: Option<&str>) -> bool {
    matches!((normalized(left), normalized(right)), (Some(left), Some(right)) if left == right)
}

fn valid_duration(value: Option<f64>) -> Option<f64> {
    value.filter(|value| value.is_finite() && *value > 0.0 && *value <= 86_400.0)
}

fn validated_candidate_file(
    session: &ScanSession,
    track: &SessionTrack,
) -> Option<(PathBuf, fs::Metadata, FileVersion)> {
    if !session.root.is_absolute() || !track.absolute_path.is_absolute() {
        return None;
    }
    let link_metadata = fs::symlink_metadata(&track.absolute_path).ok()?;
    if link_metadata.file_type().is_symlink() || !link_metadata.is_file() {
        return None;
    }
    let canonical_root = fs::canonicalize(&session.root).ok()?;
    let canonical_path = fs::canonicalize(&track.absolute_path).ok()?;
    if !canonical_path.starts_with(&canonical_root) {
        return None;
    }
    let expected_path = session.root.join(Path::new(&track.track.relative_path));
    if fs::canonicalize(expected_path).ok()? != canonical_path {
        return None;
    }
    let metadata = fs::metadata(&canonical_path).ok()?;
    if !metadata.is_file() {
        return None;
    }
    let version = file_version(&metadata);
    let expected = session.file_versions.get(&track.track.relative_path)?;
    if expected != &version {
        return None;
    }
    Some((canonical_path, metadata, version))
}

fn score_candidate(
    library: &LostTrackRepairLibraryTrack,
    canonical_path: &Path,
    size: u64,
) -> Option<(u8, Vec<&'static str>, [u8; 32])> {
    let old_fingerprint = parse_library_fingerprint(&library.file_fingerprint).ok()?;
    if size == library.file_size {
        if let Ok(fingerprint) = hash_file(canonical_path, size) {
            if fingerprint == old_fingerprint {
                return Some((100, vec!["hash", "size"], fingerprint));
            }
        }
    }

    let current = read_audio_metadata(canonical_path).ok()?;
    let title_match = same_text(Some(&library.title), current.title.as_deref());
    let artist_match = same_text(library.artist.as_deref(), current.artist.as_deref());
    let album_match = same_text(library.album.as_deref(), current.album.as_deref());
    let genre_match = same_text(library.genre.as_deref(), current.genre.as_deref());
    let duration_difference = match (
        valid_duration(library.duration_seconds),
        valid_duration(current.duration_seconds),
    ) {
        (Some(left), Some(right)) => Some((left - right).abs()),
        _ => None,
    };
    let duration_strong = duration_difference.is_some_and(|difference| difference <= 0.75);
    let duration_close = duration_difference.is_some_and(|difference| difference <= 2.0);
    if !title_match || !duration_close || !(artist_match || album_match) {
        return None;
    }

    let mut score = 0_u8;
    let mut reasons = Vec::new();
    if title_match {
        score = score.saturating_add(25);
        reasons.push("title");
    }
    if artist_match {
        score = score.saturating_add(20);
        reasons.push("artist");
    }
    if album_match {
        score = score.saturating_add(8);
        reasons.push("album");
    }
    if genre_match {
        score = score.saturating_add(5);
        reasons.push("genre");
    }
    if duration_strong {
        score = score.saturating_add(35);
        reasons.push("duration");
    } else if duration_close {
        score = score.saturating_add(25);
        reasons.push("duration");
    }
    if library.file_size > 0 {
        let difference = library.file_size.abs_diff(size) as f64 / library.file_size as f64;
        if difference <= 0.005 {
            score = score.saturating_add(7);
            reasons.push("size");
        } else if difference <= 0.02 {
            score = score.saturating_add(4);
            reasons.push("size");
        }
    }
    if score < MIN_REPAIR_CONFIDENCE {
        return None;
    }
    let fingerprint = hash_file(canonical_path, size).ok()?;
    Some((score.min(99), reasons, fingerprint))
}

fn valid_library_track(track: &LostTrackRepairLibraryTrack) -> bool {
    valid_library_track_id(&track.track_id)
        && track.file_size <= MAX_SAFE_JSON_INTEGER
        && parse_library_fingerprint(&track.file_fingerprint).is_ok()
        && !track.title.trim().is_empty()
        && track.title.chars().count() <= 300
        && [
            track.artist.as_ref(),
            track.album.as_ref(),
            track.genre.as_ref(),
        ]
        .into_iter()
        .flatten()
        .all(|value| value.chars().count() <= 300 && !value.chars().any(char::is_control))
        && valid_duration(track.duration_seconds).is_some() == track.duration_seconds.is_some()
}

fn matching_anchor(
    alias_path: &Path,
    library: &LostTrackRepairLibraryTrack,
) -> Option<LocalFileIdentity> {
    let store = read_local_alias_store(alias_path);
    let record = store.tracks.get(&library.track_id)?;
    let anchor = LocalFileIdentity {
        fingerprint: library.file_fingerprint.to_ascii_lowercase(),
        size: library.file_size,
    };
    (record.anchor == anchor).then_some(anchor)
}

fn score_for_library_track(
    session: &ScanSession,
    library: &LostTrackRepairLibraryTrack,
) -> Vec<ScoredCandidate> {
    let already_linked_scan_ids = session
        .library_links
        .values()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let mut scored = session
        .tracks
        .values()
        .filter(|track| !already_linked_scan_ids.contains(track.track.scan_id.as_str()))
        .filter_map(|track| {
            let (canonical_path, metadata, version) = validated_candidate_file(session, track)?;
            let (confidence, reasons, fingerprint) =
                score_candidate(library, &canonical_path, metadata.len())?;
            Some(ScoredCandidate {
                confidence,
                fingerprint,
                reasons,
                track: track.clone(),
                version,
            })
        })
        .collect::<Vec<_>>();
    scored.sort_by(|left, right| {
        right.confidence.cmp(&left.confidence).then_with(|| {
            left.track
                .track
                .relative_path
                .to_ascii_lowercase()
                .cmp(&right.track.track.relative_path.to_ascii_lowercase())
        })
    });
    scored.truncate(MAX_CANDIDATES_PER_TRACK);
    scored
}

pub(super) fn preview(
    state: &DesktopState,
    session_id: String,
    library_tracks: Vec<LostTrackRepairLibraryTrack>,
    alias_path: &Path,
) -> Result<LostTrackRepairPreview, String> {
    if library_tracks.is_empty() || library_tracks.len() > MAX_REPAIR_TRACKS {
        return Err(format!(
            "Selecciona entre 1 y {MAX_REPAIR_TRACKS} referencias perdidas."
        ));
    }
    let mut unique = HashSet::with_capacity(library_tracks.len());
    if library_tracks
        .iter()
        .any(|track| !valid_library_track(track) || !unique.insert(track.track_id.clone()))
    {
        return Err("La solicitud de reparación no es válida.".to_owned());
    }

    let current_session = state
        .scan_session
        .lock()
        .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
    let session = current_session
        .as_ref()
        .filter(|session| session.id == session_id)
        .ok_or_else(|| {
            "El escaneo ya no está disponible. Vuelve a escanear la carpeta.".to_owned()
        })?;

    let mut previews = Vec::new();
    let mut unresolved = Vec::new();
    let mut receipts = Vec::new();
    for library in &library_tracks {
        if session.library_links.contains_key(&library.track_id) {
            unresolved.push(library.track_id.clone());
            continue;
        }
        let Some(anchor) = matching_anchor(alias_path, library) else {
            unresolved.push(library.track_id.clone());
            continue;
        };
        let scored = score_for_library_track(session, library);
        if scored.is_empty() {
            unresolved.push(library.track_id.clone());
            continue;
        }
        let candidates = scored
            .iter()
            .map(|candidate| LostTrackRepairCandidate {
                confidence: candidate.confidence,
                reasons: candidate.reasons.clone(),
                relative_path: candidate.track.track.relative_path.clone(),
                scan_id: candidate.track.track.scan_id.clone(),
            })
            .collect();
        for candidate in scored {
            receipts.push((
                (
                    session_id.clone(),
                    library.track_id.clone(),
                    candidate.track.track.scan_id.clone(),
                ),
                LostTrackRepairReceipt {
                    anchor: anchor.clone(),
                    file_version: candidate.version,
                    fingerprint: candidate.fingerprint,
                    session_id: session_id.clone(),
                },
            ));
        }
        previews.push(LostTrackRepairTrackPreview {
            candidates,
            title: library.title.clone(),
            track_id: library.track_id.clone(),
        });
    }
    drop(current_session);

    let mut pending = state
        .pending_lost_track_repairs
        .lock()
        .map_err(|_| "No se pudo guardar la previsualización de reparación.".to_owned())?;
    pending.clear();
    pending.extend(receipts);

    Ok(LostTrackRepairPreview {
        tracks: previews,
        unresolved_track_ids: unresolved,
    })
}

pub(super) fn apply(
    state: &DesktopState,
    session_id: String,
    selections: Vec<LostTrackRepairSelection>,
    alias_path: &Path,
) -> Result<LostTrackRepairApplyResult, String> {
    if selections.is_empty() || selections.len() > MAX_REPAIR_TRACKS {
        return Err(format!(
            "Confirma entre 1 y {MAX_REPAIR_TRACKS} reparaciones."
        ));
    }
    let mut track_ids = HashSet::new();
    let mut scan_ids = HashSet::new();
    if selections.iter().any(|selection| {
        !valid_library_track_id(&selection.track_id)
            || selection.scan_id.is_empty()
            || !track_ids.insert(selection.track_id.clone())
            || !scan_ids.insert(selection.scan_id.clone())
    }) {
        return Err("La confirmación contiene referencias no válidas o repetidas.".to_owned());
    }

    let pending = state
        .pending_lost_track_repairs
        .lock()
        .map_err(|_| "La previsualización de reparación ya no está disponible.".to_owned())?;
    let receipts = selections
        .iter()
        .map(|selection| {
            pending
                .get(&(
                    session_id.clone(),
                    selection.track_id.clone(),
                    selection.scan_id.clone(),
                ))
                .cloned()
                .ok_or_else(|| {
                    "La reparación no coincide con la última previsualización.".to_owned()
                })
        })
        .collect::<Result<Vec<_>, _>>()?;
    drop(pending);

    let alias_store = read_local_alias_store(alias_path);
    let mut current_session = state
        .scan_session
        .lock()
        .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
    let session = current_session
        .as_mut()
        .filter(|session| session.id == session_id)
        .ok_or_else(|| {
            "El escaneo ya no está disponible. Vuelve a escanear la carpeta.".to_owned()
        })?;

    let linked_scan_ids = session
        .library_links
        .values()
        .cloned()
        .collect::<HashSet<_>>();
    let mut aliases = Vec::with_capacity(selections.len());
    for (selection, receipt) in selections.iter().zip(&receipts) {
        if receipt.session_id != session_id
            || session.library_links.contains_key(&selection.track_id)
            || linked_scan_ids.contains(&selection.scan_id)
        {
            return Err("La vinculación cambió desde la previsualización.".to_owned());
        }
        let record = alias_store
            .tracks
            .get(&selection.track_id)
            .ok_or_else(|| "La referencia local original ya no está disponible.".to_owned())?;
        if record.anchor != receipt.anchor {
            return Err("La referencia de biblioteca cambió desde la previsualización.".to_owned());
        }
        let track = session
            .tracks
            .get(&selection.scan_id)
            .ok_or_else(|| "El archivo candidato ya no pertenece al escaneo activo.".to_owned())?;
        let (canonical_path, metadata, current_version) = validated_candidate_file(session, track)
            .ok_or_else(|| {
                "El archivo candidato ya no es un archivo válido del escaneo activo.".to_owned()
            })?;
        if current_version != receipt.file_version {
            return Err("El archivo candidato cambió desde la previsualización.".to_owned());
        }
        let fingerprint = hash_file(&canonical_path, metadata.len())
            .map_err(|_| "No se pudo volver a verificar el archivo candidato.".to_owned())?;
        if fingerprint != receipt.fingerprint {
            return Err("La huella del candidato cambió desde la previsualización.".to_owned());
        }
        aliases.push((selection.track_id.clone(), fingerprint, metadata.len()));
    }

    persist_local_aliases(alias_path, &aliases)
        .map_err(|_| "No se pudo guardar el vínculo local reparado.".to_owned())?;

    let links = selections
        .into_iter()
        .map(|selection| {
            session
                .library_links
                .insert(selection.track_id.clone(), selection.scan_id.clone());
            LibraryTrackLink {
                scan_id: selection.scan_id,
                track_id: selection.track_id,
            }
        })
        .collect::<Vec<_>>();
    drop(current_session);

    if let Ok(mut pending) = state.pending_lost_track_repairs.lock() {
        pending.retain(|(pending_session, pending_track, _), _| {
            pending_session != &session_id
                || !links.iter().any(|link| &link.track_id == pending_track)
        });
    }

    Ok(LostTrackRepairApplyResult { links })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ScannedAudioFile;
    use std::{
        collections::HashMap,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn valid_wav() -> Vec<u8> {
        let sample_rate = 8_000_u32;
        let data_length = sample_rate;
        let mut wav = Vec::with_capacity((44 + data_length) as usize);
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_length).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16_u32.to_le_bytes());
        wav.extend_from_slice(&1_u16.to_le_bytes());
        wav.extend_from_slice(&1_u16.to_le_bytes());
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&1_u16.to_le_bytes());
        wav.extend_from_slice(&8_u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_length.to_le_bytes());
        wav.resize((44 + data_length) as usize, 128);
        wav
    }

    fn temp_root(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "djorganizer-lost-repair-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn session_track(path: PathBuf, relative_path: &str, metadata: &fs::Metadata) -> SessionTrack {
        SessionTrack {
            absolute_path: path,
            track: ScannedAudioFile {
                scan_id: "scan-1".into(),
                name: "candidate.wav".into(),
                relative_path: relative_path.into(),
                extension: "wav".into(),
                size_bytes: metadata.len(),
                metadata_read: true,
                title: Some("Opening".into()),
                artist: Some("DJ Aurora".into()),
                album: Some("Album".into()),
                genre: Some("House".into()),
                duration_seconds: Some(1.0),
                bpm: None,
                musical_key: None,
                duplicate_group: None,
            },
        }
    }

    fn library_track(file_size: u64) -> LostTrackRepairLibraryTrack {
        LostTrackRepairLibraryTrack {
            album: Some("Album".into()),
            artist: Some("DJ Aurora".into()),
            duration_seconds: Some(1.0),
            file_fingerprint: "00".repeat(32),
            file_size,
            genre: Some("House".into()),
            title: "Opening".into(),
            track_id: "11111111-1111-4111-8111-111111111111".into(),
        }
    }

    #[test]
    fn stale_scan_metadata_does_not_create_a_metadata_candidate() {
        let root = temp_root("stale-metadata");
        let path = root.join("candidate.wav");
        fs::write(&path, valid_wav()).unwrap();
        let metadata = fs::metadata(&path).unwrap();
        let relative = "candidate.wav";
        let track = session_track(path, relative, &metadata);
        let session = ScanSession {
            file_versions: HashMap::from([(relative.to_owned(), file_version(&metadata))]),
            id: "session".into(),
            incremental_scan_active: false,
            root: root.clone(),
            tracks: HashMap::from([(track.track.scan_id.clone(), track)]),
            truncated: false,
            library_links: HashMap::new(),
        };

        // The scan snapshot claims matching title/artist metadata, but the current WAV
        // has no such tags. Scoring must use the current file and reject it.
        assert!(score_for_library_track(&session, &library_track(metadata.len())).is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn candidate_symlink_outside_scan_root_is_rejected() {
        use std::os::unix::fs::symlink;

        let root = temp_root("symlink-root");
        let outside = temp_root("symlink-outside");
        let outside_path = outside.join("outside.wav");
        fs::write(&outside_path, valid_wav()).unwrap();
        let link_path = root.join("candidate.wav");
        symlink(&outside_path, &link_path).unwrap();
        let metadata = fs::metadata(&link_path).unwrap();
        let relative = "candidate.wav";
        let track = session_track(link_path, relative, &metadata);
        let session = ScanSession {
            file_versions: HashMap::from([(relative.to_owned(), file_version(&metadata))]),
            id: "session".into(),
            incremental_scan_active: false,
            root: root.clone(),
            tracks: HashMap::from([(track.track.scan_id.clone(), track.clone())]),
            truncated: false,
            library_links: HashMap::new(),
        };

        assert!(validated_candidate_file(&session, &track).is_none());
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn normalization_is_case_and_whitespace_insensitive() {
        assert!(same_text(Some("  DJ   Aurora "), Some("dj aurora")));
        assert!(!same_text(Some("DJ Aurora"), Some("DJ Other")));
    }
}
