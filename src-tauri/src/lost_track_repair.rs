use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path};

use super::{
    file_version, hash_file, parse_library_fingerprint, persist_local_aliases,
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

fn score_candidate(
    library: &LostTrackRepairLibraryTrack,
    track: &SessionTrack,
) -> Option<(u8, Vec<&'static str>, [u8; 32])> {
    let size = track.track.size_bytes;
    let old_fingerprint = parse_library_fingerprint(&library.file_fingerprint).ok()?;

    if size == library.file_size {
        if let Ok(fingerprint) = hash_file(&track.absolute_path, size) {
            if fingerprint == old_fingerprint {
                return Some((100, vec!["hash", "size"], fingerprint));
            }
        }
    }

    let title_match = same_text(Some(&library.title), track.track.title.as_deref());
    let artist_match = same_text(library.artist.as_deref(), track.track.artist.as_deref());
    let album_match = same_text(library.album.as_deref(), track.track.album.as_deref());
    let genre_match = same_text(library.genre.as_deref(), track.track.genre.as_deref());
    let duration_difference = match (
        valid_duration(library.duration_seconds),
        valid_duration(track.track.duration_seconds),
    ) {
        (Some(left), Some(right)) => Some((left - right).abs()),
        _ => None,
    };
    let duration_strong = duration_difference.is_some_and(|difference| difference <= 0.75);
    let duration_close = duration_difference.is_some_and(|difference| difference <= 2.0);

    // Metadata-only recovery is intentionally conservative: title and duration must
    // agree, plus artist or album. Ambiguous or weak matches are not surfaced.
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
    let fingerprint = hash_file(&track.absolute_path, size).ok()?;
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
            let (confidence, reasons, fingerprint) = score_candidate(library, track)?;
            let version = session
                .file_versions
                .get(&track.track.relative_path)?
                .clone();
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
        let metadata = fs::metadata(&track.absolute_path)
            .map_err(|_| "El archivo candidato ya no está disponible.".to_owned())?;
        let expected = session
            .file_versions
            .get(&track.track.relative_path)
            .ok_or_else(|| "El archivo candidato cambió desde el escaneo.".to_owned())?;
        if file_version(&metadata) != receipt.file_version || expected != &receipt.file_version {
            return Err("El archivo candidato cambió desde la previsualización.".to_owned());
        }
        let fingerprint = hash_file(&track.absolute_path, metadata.len())
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
    use crate::{ScannedAudioFile, SessionTrack};
    use std::path::PathBuf;

    fn track(
        title: Option<&str>,
        artist: Option<&str>,
        album: Option<&str>,
        genre: Option<&str>,
        duration: Option<f64>,
        size: u64,
    ) -> SessionTrack {
        SessionTrack {
            absolute_path: PathBuf::from("candidate.mp3"),
            track: ScannedAudioFile {
                scan_id: "scan-1".into(),
                name: "candidate.mp3".into(),
                relative_path: "Moved/candidate.mp3".into(),
                extension: "mp3".into(),
                size_bytes: size,
                metadata_read: true,
                title: title.map(str::to_owned),
                artist: artist.map(str::to_owned),
                album: album.map(str::to_owned),
                genre: genre.map(str::to_owned),
                duration_seconds: duration,
                bpm: None,
                musical_key: None,
                duplicate_group: None,
            },
        }
    }

    #[test]
    fn metadata_matching_requires_title_duration_and_artist_or_album() {
        let library = LostTrackRepairLibraryTrack {
            album: Some("Album".into()),
            artist: Some("DJ Aurora".into()),
            duration_seconds: Some(180.0),
            file_fingerprint: "00".repeat(32),
            file_size: 1_000_000,
            genre: Some("House".into()),
            title: "Opening".into(),
            track_id: "11111111-1111-4111-8111-111111111111".into(),
        };
        let strong = track(
            Some(" opening "),
            Some("DJ AURORA"),
            Some("Album"),
            Some("House"),
            Some(180.2),
            1_005_000,
        );
        let weak = track(
            Some("Opening"),
            Some("Different"),
            Some("Different"),
            Some("House"),
            Some(180.1),
            1_000_000,
        );
        // The function hashes only after the metadata gate, so a non-existent test
        // path still proves weak candidates are rejected before any file access.
        assert!(score_candidate(&library, &weak).is_none());
        assert!(same_text(
            library.artist.as_deref(),
            strong.track.artist.as_deref()
        ));
    }

    #[test]
    fn normalization_is_case_and_whitespace_insensitive() {
        assert!(same_text(Some("  DJ   Aurora "), Some("dj aurora")));
        assert!(!same_text(Some("DJ Aurora"), Some("DJ Other")));
    }
}
