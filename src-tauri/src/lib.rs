mod audio_decoder;
mod audio_resampler;
mod maest;
mod maest_inference_pipeline;
mod maest_pipeline;
mod maest_preprocessing;

use lofty::{
    config::{ParseOptions, WriteOptions},
    file::{AudioFile, TaggedFileExt},
    mp4::{AtomData, AtomIdent, Ilst, Mp4File},
    read_from_path,
    tag::{Accessor, ItemKey, Tag},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::{self, File},
    io::{BufReader, Read, Seek, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::UpdaterExt;

const AUDIO_EXTENSIONS: &[&str] = &[
    "aac", "aif", "aiff", "alac", "flac", "m4a", "mp3", "ogg", "opus", "wav",
];
const MAX_ENTRIES: usize = 100_000;
const MAX_TRACKS: usize = 10_000;
const MAX_METADATA_WRITE_TRACKS: usize = 25;
const MAX_REKORDBOX_CRATES: usize = 200;
const MAX_REKORDBOX_XML_BYTES: usize = 20_000_000;
const METADATA_BACKUP_DIRECTORY: &str = ".djorganizer-backups";
const MAX_PENDING_MAEST_GENRE_PREVIEWS: usize = 64;
const MAX_ACTIVE_MAEST_ANALYSES: usize = 8;
const LIBRARY_FILE_ALIASES_VERSION: u8 = 1;
const MAX_LIBRARY_FILE_ALIAS_TRACKS: usize = 10_000;
const MAX_LIBRARY_FILE_ALIASES_PER_TRACK: usize = 8;
const MAX_SAFE_JSON_INTEGER: u64 = 9_007_199_254_740_991;
const LIBRARY_FILE_ALIASES_NAME: &str = "library-file-aliases.json";

#[derive(Debug, Default, PartialEq)]
struct AudioMetadata {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    genre: Option<String>,
    subgenre: Option<String>,
    duration_seconds: Option<f64>,
    bpm: Option<f64>,
    musical_key: Option<String>,
}

#[cfg(test)]
mod scanned_track_analysis_tests {
    use super::*;
    use std::io::Read;

    fn fixture() -> (PathBuf, DesktopState, AnalyzeScannedTrackRequest, Vec<u8>) {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "djorganizer-analysis-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        let bytes = b"server-confirmed-audio".to_vec();
        let path = root.join("track.wav");
        fs::write(&path, &bytes).unwrap();
        let metadata = fs::symlink_metadata(&path).unwrap();
        let version = file_version(&metadata);
        let scan_id = "opaque-track".to_owned();
        let track = SessionTrack {
            absolute_path: path,
            track: ScannedAudioFile {
                scan_id: scan_id.clone(),
                name: "track.wav".into(),
                relative_path: "track.wav".into(),
                extension: "wav".into(),
                size_bytes: metadata.len(),
                metadata_read: false,
                title: None,
                artist: None,
                album: None,
                genre: None,
                duration_seconds: None,
                bpm: None,
                musical_key: None,
                duplicate_group: None,
            },
        };
        let state = DesktopState::default();
        let relative_path = track.track.relative_path.clone();
        *state.scan_session.lock().unwrap() = Some(ScanSession {
            file_versions: HashMap::from([(relative_path, version)]),
            id: "opaque-session".into(),
            incremental_scan_active: false,
            root: root.clone(),
            tracks: HashMap::from([(scan_id.clone(), track)]),
            truncated: false,
            library_links: HashMap::new(),
        });
        (
            root,
            state,
            AnalyzeScannedTrackRequest {
                session_id: "opaque-session".into(),
                scan_id,
                operation_id: "00000000-0000-4000-8000-000000000001".into(),
            },
            bytes,
        )
    }

    fn proposal(at: &str) -> maest::MaestAnalysisResult {
        let field = |name: &'static str, value: &str| maest::ProposedTextField {
            field: name,
            status: "completed",
            source: "automatic",
            proposed_value: Some(value.into()),
            score: Some(0.75),
            error: None,
            analyzed_at: at.into(),
        };
        maest::MaestAnalysisResult {
            analyzer: maest::AnalyzerIdentity {
                id: maest::ANALYZER_ID,
                version: maest::ANALYZER_VERSION,
            },
            compatibility_key: maest::COMPATIBILITY_KEY,
            genre: field("genre", "Electronic"),
            subgenre: field("subgenre", "House"),
            partial_errors: vec![],
        }
    }

    fn replace_preserving_size_and_modified(path: &Path) {
        let metadata = fs::metadata(path).unwrap();
        let modified = metadata.modified().unwrap();
        let size = metadata.len() as usize;
        let old = path.with_extension("old");
        fs::rename(path, old).unwrap();
        let replacement = File::create(path).unwrap();
        replacement.set_len(size as u64).unwrap();
        replacement
            .set_times(fs::FileTimes::new().set_modified(modified))
            .unwrap();
    }

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

    #[test]
    fn real_and_incremental_scans_resolve_versions_by_relative_path() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "djorganizer-analysis-scan-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("scanned.wav"), valid_wav()).unwrap();
        let state = DesktopState::default();
        let session_id = "real-scan-session".to_owned();
        let completed = scan_music_folder(&root, session_id.clone()).unwrap();
        let scan_id = completed.result.tracks[0].scan_id.clone();
        activate_completed_scan(&state, root.clone(), session_id.clone(), completed).unwrap();
        let request = AnalyzeScannedTrackRequest {
            session_id: session_id.clone(),
            scan_id: scan_id.clone(),
            operation_id: "00000000-0000-4000-8000-000000000002".into(),
        };
        let resolved = resolve_analysis_track(&state, &request).unwrap();
        assert_eq!(resolved.relative_path, PathBuf::from("scanned.wav"));
        let (previous_tracks, previous_versions) = {
            let guard = state.scan_session.lock().unwrap();
            let session = guard.as_ref().unwrap();
            assert!(session.file_versions.contains_key("scanned.wav"));
            assert!(!session.file_versions.contains_key(&scan_id));
            (session.tracks.clone(), session.file_versions.clone())
        };
        let incremental = scan_music_folder_with_previous(
            &root,
            session_id.clone(),
            Some(&previous_tracks),
            Some(&previous_versions),
        )
        .unwrap();
        activate_completed_scan(&state, root.clone(), session_id, incremental).unwrap();
        assert_eq!(
            resolve_analysis_track(&state, &request)
                .unwrap()
                .expected_version,
            resolved.expected_version
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn descriptor_identity_is_stable_for_clones_and_distinguishes_files() {
        let (root, _, _, _) = fixture();
        let first = File::open(root.join("track.wav")).unwrap();
        let cloned = first.try_clone().unwrap();
        fs::write(root.join("other.wav"), b"server-confirmed-audio").unwrap();
        let other = File::open(root.join("other.wav")).unwrap();
        assert_eq!(
            analysis_file_identity(&first),
            analysis_file_identity(&cloned)
        );
        assert_ne!(
            analysis_file_identity(&first),
            analysis_file_identity(&other)
        );
        drop((first, cloned, other));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn windows_descriptor_ffi_returns_distinct_file_indices() {
        let (root, _, _, _) = fixture();
        fs::write(root.join("other.wav"), b"server-confirmed-audio").unwrap();
        let first = File::open(root.join("track.wav")).unwrap();
        let other = File::open(root.join("other.wav")).unwrap();
        assert_ne!(
            analysis_file_identity(&first),
            analysis_file_identity(&other)
        );
        drop((first, other));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn valid_track_uses_server_file_releases_mutex_and_returns_minimal_proposal() {
        let (root, state, request, expected) = fixture();
        let result = analyze_confirmed_track_with(&state, request, |mut file, _, at| {
            assert!(state.scan_session.try_lock().is_ok());
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes).unwrap();
            assert_eq!(bytes, expected);
            Ok(proposal(at))
        })
        .unwrap();
        assert_eq!(result.scan_id, "opaque-track");
        let value = serde_json::to_value(&result).unwrap();
        assert_eq!(
            value
                .as_object()
                .unwrap()
                .keys()
                .cloned()
                .collect::<Vec<_>>(),
            ["analysis", "scanId"]
        );
        let json = value.to_string();
        for forbidden in [
            "sessionId",
            "path",
            "relativePath",
            "pcm",
            "tensor",
            "scores",
        ] {
            assert!(!json.contains(forbidden));
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_unknown_fields_sessions_and_tracks() {
        assert!(
            serde_json::from_value::<AnalyzeScannedTrackRequest>(serde_json::json!({
                "sessionId":"opaque-session", "scanId":"opaque-track", "path":"/tmp/track.wav"
            }))
            .is_err()
        );
        let (root, state, mut request, _) = fixture();
        request.session_id = "expired".into();
        assert_eq!(
            resolve_analysis_track(&state, &request).unwrap_err().code,
            "scan_session_unavailable"
        );
        request.session_id = "opaque-session".into();
        request.scan_id = "unknown".into();
        assert_eq!(
            resolve_analysis_track(&state, &request).unwrap_err().code,
            "track_not_in_session"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_invalid_paths_missing_and_changed_files() {
        let (root, state, request, _) = fixture();
        {
            let mut guard = state.scan_session.lock().unwrap();
            guard
                .as_mut()
                .unwrap()
                .tracks
                .get_mut(&request.scan_id)
                .unwrap()
                .absolute_path = PathBuf::from("relative.wav");
        }
        assert_eq!(
            analyze_confirmed_track_with(&state, request.clone(), |_, _, at| Ok(proposal(at)))
                .unwrap_err()
                .code,
            "track_unavailable"
        );
        {
            let mut guard = state.scan_session.lock().unwrap();
            guard
                .as_mut()
                .unwrap()
                .tracks
                .get_mut(&request.scan_id)
                .unwrap()
                .absolute_path = std::env::temp_dir().join("outside-confirmed-root.wav");
        }
        assert_eq!(
            analyze_confirmed_track_with(&state, request.clone(), |_, _, at| Ok(proposal(at)))
                .unwrap_err()
                .code,
            "track_unavailable"
        );
        {
            let mut guard = state.scan_session.lock().unwrap();
            let session = guard.as_mut().unwrap();
            let track = session.tracks.get_mut(&request.scan_id).unwrap();
            track.absolute_path = root.join("other.wav");
            track.track.relative_path = "track.wav".into();
        }
        fs::write(root.join("other.wav"), b"server-confirmed-audio").unwrap();
        assert_eq!(
            analyze_confirmed_track_with(&state, request.clone(), |_, _, at| Ok(proposal(at)))
                .unwrap_err()
                .code,
            "track_unavailable"
        );
        {
            let mut guard = state.scan_session.lock().unwrap();
            let track = guard
                .as_mut()
                .unwrap()
                .tracks
                .get_mut(&request.scan_id)
                .unwrap();
            track.absolute_path = root.join("track.wav");
        }
        fs::remove_file(root.join("track.wav")).unwrap();
        assert_eq!(
            analyze_confirmed_track_with(&state, request, |_, _, at| Ok(proposal(at)))
                .unwrap_err()
                .code,
            "track_unavailable"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn discards_changes_before_and_during_analysis() {
        let (root, state, request, _) = fixture();
        fs::write(root.join("track.wav"), b"changed-size").unwrap();
        assert_eq!(
            analyze_confirmed_track_with(&state, request.clone(), |_, _, at| Ok(proposal(at)))
                .unwrap_err()
                .code,
            "track_changed"
        );
        let (root2, state2, request2, _) = fixture();
        let path = root2.join("track.wav");
        let error = analyze_confirmed_track_with(&state2, request2, |_, _, at| {
            fs::write(&path, b"changed-during-analysis-with-new-size").unwrap();
            Ok(proposal(at))
        })
        .unwrap_err();
        assert_eq!(error.code, "track_changed");
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(root2).unwrap();
    }

    #[test]
    fn rejects_identity_change_between_validation_and_open_without_executing() {
        let (root, state, request, _) = fixture();
        let path = root.join("track.wav");
        let executed = std::cell::Cell::new(false);
        let error = analyze_confirmed_track_with_open(
            &state,
            request,
            |confirmed| {
                replace_preserving_size_and_modified(confirmed);
                File::open(confirmed)
            },
            |_, _, at| {
                executed.set(true);
                Ok(proposal(at))
            },
        )
        .unwrap_err();
        assert_eq!(error.code, "track_changed");
        assert!(!executed.get());
        let serialized = serde_json::to_string(&error).unwrap();
        assert!(!serialized.contains(path.to_str().unwrap()));
        assert!(!serialized.to_ascii_lowercase().contains("handle"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_same_size_and_modified_identity_change_during_analysis() {
        let (root, state, request, _) = fixture();
        let path = root.join("track.wav");
        let error = analyze_confirmed_track_with(&state, request, |_, _, at| {
            replace_preserving_size_and_modified(&path);
            Ok(proposal(at))
        })
        .unwrap_err();
        assert_eq!(error.code, "track_changed");
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink() {
        use std::os::unix::fs::symlink;
        let (root, state, request, _) = fixture();
        let target = root.join("target.wav");
        fs::rename(root.join("track.wav"), &target).unwrap();
        symlink(&target, root.join("track.wav")).unwrap();
        assert_eq!(
            analyze_confirmed_track_with(&state, request, |_, _, at| Ok(proposal(at)))
                .unwrap_err()
                .code,
            "track_unavailable"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn rejects_intermediate_symlink_escape() {
        use std::os::unix::fs::symlink;
        let (root, state, request, _) = fixture();
        let outside = root.with_extension("outside");
        fs::create_dir_all(&outside).unwrap();
        let outside_track = outside.join("track.wav");
        fs::rename(root.join("track.wav"), &outside_track).unwrap();
        symlink(&outside, root.join("linked")).unwrap();
        {
            let mut guard = state.scan_session.lock().unwrap();
            let session = guard.as_mut().unwrap();
            let track = session.tracks.get_mut(&request.scan_id).unwrap();
            track.absolute_path = root.join("linked/track.wav");
            track.track.relative_path = "linked/track.wav".into();
        }
        let error =
            analyze_confirmed_track_with(&state, request, |_, _, at| Ok(proposal(at))).unwrap_err();
        assert_eq!(error.code, "track_unavailable");
        fs::remove_dir_all(root).unwrap();
        fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn preserves_pipeline_error_and_maps_task_failure() {
        let (root, state, request, _) = fixture();
        let error = analyze_confirmed_track_with(&state, request, |_, _, _| {
            Err(analysis_error(
                "invalid_audio_source",
                Some("decode"),
                "safe",
            ))
        })
        .unwrap_err();
        assert_eq!(
            (error.stage.as_deref(), error.code.as_str()),
            (Some("decode"), "invalid_audio_source")
        );
        let failed: Result<(), &str> = Err("join details and /private/path");
        let error = map_analysis_task_result(failed).unwrap_err();
        assert_eq!(error.code, "analysis_task_failed");
        assert!(!serde_json::to_string(&error).unwrap().contains("private"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unprepared_model_is_not_used() {
        assert!(maest::MaestState::default()
            .with_ready_session(|_, _| ())
            .is_none());
    }

    #[test]
    fn maest_operation_handshake_arms_cancels_starts_once_and_cleans_up() {
        let state = DesktopState::default();
        let request = AnalyzeScannedTrackRequest {
            session_id: "session-a".into(),
            scan_id: "scan-a".into(),
            operation_id: "00000000-0000-4000-8000-000000000010".into(),
        };
        begin_maest_operation(&state, &request).unwrap();
        {
            let active = state.active_maest_analyses.lock().unwrap();
            let operation = active.get(&request.operation_id).unwrap();
            assert_eq!(operation.state, ActiveMaestAnalysisState::Armed);
            assert!(!operation.cancel.load(Ordering::Acquire));
        }
        assert_eq!(
            begin_maest_operation(&state, &request).unwrap_err().code,
            "invalid_request"
        );

        for cancel in [
            CancelMaestAnalysisRequest {
                operation_id: "00000000-0000-4000-8000-000000000011".into(),
                session_id: "session-a".into(),
                scan_id: "scan-a".into(),
            },
            CancelMaestAnalysisRequest {
                operation_id: request.operation_id.clone(),
                session_id: "session-b".into(),
                scan_id: "scan-a".into(),
            },
            CancelMaestAnalysisRequest {
                operation_id: request.operation_id.clone(),
                session_id: "session-a".into(),
                scan_id: "scan-b".into(),
            },
        ] {
            request_maest_cancellation(&state, &cancel);
            assert!(!state
                .active_maest_analyses
                .lock()
                .unwrap()
                .get(&request.operation_id)
                .unwrap()
                .cancel
                .load(Ordering::Acquire));
        }
        request_maest_cancellation(
            &state,
            &CancelMaestAnalysisRequest {
                operation_id: request.operation_id.clone(),
                session_id: "session-a".into(),
                scan_id: "scan-a".into(),
            },
        );
        let operation = start_maest_operation(&state, &request).unwrap();
        assert!(operation.cancel.load(Ordering::Acquire));
        assert_eq!(
            ensure_maest_operation_active(&operation).unwrap_err().code,
            "analysis_cancelled"
        );
        assert_eq!(
            state
                .active_maest_analyses
                .lock()
                .unwrap()
                .get(&request.operation_id)
                .unwrap()
                .state,
            ActiveMaestAnalysisState::Running
        );
        assert_eq!(
            start_maest_operation(&state, &request).unwrap_err().code,
            "invalid_request"
        );
        drop(operation);
        assert!(state.active_maest_analyses.lock().unwrap().is_empty());
    }

    #[test]
    fn maest_analysis_requires_an_exact_armed_operation() {
        let state = DesktopState::default();
        let request = AnalyzeScannedTrackRequest {
            session_id: "session-a".into(),
            scan_id: "scan-a".into(),
            operation_id: "00000000-0000-4000-8000-000000000030".into(),
        };
        assert_eq!(
            start_maest_operation(&state, &request).unwrap_err().code,
            "invalid_request"
        );
        begin_maest_operation(&state, &request).unwrap();
        for mismatch in [
            AnalyzeScannedTrackRequest {
                operation_id: "00000000-0000-4000-8000-000000000031".into(),
                ..request.clone()
            },
            AnalyzeScannedTrackRequest {
                session_id: "session-b".into(),
                ..request.clone()
            },
            AnalyzeScannedTrackRequest {
                scan_id: "scan-b".into(),
                ..request.clone()
            },
        ] {
            assert_eq!(
                start_maest_operation(&state, &mismatch).unwrap_err().code,
                "invalid_request"
            );
        }
        release_maest_operation(
            &state,
            &CancelMaestAnalysisRequest {
                session_id: request.session_id,
                scan_id: request.scan_id,
                operation_id: request.operation_id,
            },
        );
        assert!(state.active_maest_analyses.lock().unwrap().is_empty());
    }

    #[test]
    fn maest_progress_requires_the_exact_operation_and_is_removed_on_cleanup() {
        let state = DesktopState::default();
        let request = AnalyzeScannedTrackRequest {
            session_id: "session-a".into(),
            scan_id: "scan-a".into(),
            operation_id: "00000000-0000-4000-8000-000000000032".into(),
        };
        begin_maest_operation(&state, &request).unwrap();
        let progress_request = CancelMaestAnalysisRequest {
            session_id: request.session_id.clone(),
            scan_id: request.scan_id.clone(),
            operation_id: request.operation_id.clone(),
        };
        assert_eq!(
            maest_analysis_progress(&state, &progress_request),
            Some(maest_inference_pipeline::MaestAnalysisProgress::default())
        );
        let operation = start_maest_operation(&state, &request).unwrap();
        assert_eq!(
            maest_analysis_progress(&state, &progress_request),
            Some(maest_inference_pipeline::MaestAnalysisProgress::default())
        );
        for mismatch in [
            CancelMaestAnalysisRequest {
                operation_id: "00000000-0000-4000-8000-000000000033".into(),
                ..progress_request.clone()
            },
            CancelMaestAnalysisRequest {
                session_id: "session-b".into(),
                ..progress_request.clone()
            },
            CancelMaestAnalysisRequest {
                scan_id: "scan-b".into(),
                ..progress_request.clone()
            },
        ] {
            assert_eq!(maest_analysis_progress(&state, &mismatch), None);
        }
        let serialized =
            serde_json::to_value(maest_analysis_progress(&state, &progress_request)).unwrap();
        assert_eq!(
            serialized.as_object().unwrap().keys().collect::<Vec<_>>(),
            vec![
                "inferredWindows",
                "phase",
                "preparedWindows",
                "totalWindows"
            ]
        );
        drop(operation);
        assert_eq!(maest_analysis_progress(&state, &progress_request), None);
    }

    #[test]
    fn old_maest_cancellation_cannot_cancel_a_later_operation_for_the_same_track() {
        let state = DesktopState::default();
        let old = CancelMaestAnalysisRequest {
            session_id: "session-a".into(),
            scan_id: "scan-a".into(),
            operation_id: "00000000-0000-4000-8000-000000000020".into(),
        };
        let newer = AnalyzeScannedTrackRequest {
            session_id: old.session_id.clone(),
            scan_id: old.scan_id.clone(),
            operation_id: "00000000-0000-4000-8000-000000000021".into(),
        };
        begin_maest_operation(&state, &newer).unwrap();
        request_maest_cancellation(&state, &old);
        assert!(!state
            .active_maest_analyses
            .lock()
            .unwrap()
            .get(&newer.operation_id)
            .unwrap()
            .cancel
            .load(Ordering::Acquire));
    }

    #[test]
    fn maest_registry_remains_bounded() {
        let state = DesktopState::default();
        for index in 0..MAX_ACTIVE_MAEST_ANALYSES {
            begin_maest_operation(
                &state,
                &AnalyzeScannedTrackRequest {
                    session_id: "session-a".into(),
                    scan_id: format!("scan-{index}"),
                    operation_id: format!("00000000-0000-4000-8000-{index:012x}"),
                },
            )
            .unwrap();
        }
        let overflow = AnalyzeScannedTrackRequest {
            session_id: "session-a".into(),
            scan_id: "overflow".into(),
            operation_id: "00000000-0000-4000-8000-ffffffffffff".into(),
        };
        assert_eq!(
            begin_maest_operation(&state, &overflow).unwrap_err().code,
            "analyzer_busy"
        );
        assert_eq!(
            state.active_maest_analyses.lock().unwrap().len(),
            MAX_ACTIVE_MAEST_ANALYSES
        );
    }

    #[test]
    fn running_maest_operation_cleanup_is_outcome_independent() {
        for (index, cancelled) in [false, false, true].into_iter().enumerate() {
            let state = DesktopState::default();
            let request = AnalyzeScannedTrackRequest {
                session_id: "session-a".into(),
                scan_id: "scan-a".into(),
                operation_id: format!("00000000-0000-4000-8000-{:012x}", 100 + index),
            };
            begin_maest_operation(&state, &request).unwrap();
            let operation = start_maest_operation(&state, &request).unwrap();
            if cancelled {
                request_maest_cancellation(
                    &state,
                    &CancelMaestAnalysisRequest {
                        session_id: request.session_id.clone(),
                        scan_id: request.scan_id.clone(),
                        operation_id: request.operation_id.clone(),
                    },
                );
                assert!(operation.cancel.load(Ordering::Acquire));
            }
            // Dropping the guard models every return path: success, error and cancellation.
            drop(operation);
            assert!(state.active_maest_analyses.lock().unwrap().is_empty());
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedAudioFile {
    scan_id: String,
    name: String,
    relative_path: String,
    extension: String,
    size_bytes: u64,
    metadata_read: bool,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    genre: Option<String>,
    duration_seconds: Option<f64>,
    bpm: Option<f64>,
    musical_key: Option<String>,
    duplicate_group: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderScanResult {
    session_id: String,
    root_name: String,
    tracks: Vec<ScannedAudioFile>,
    examined_entries: usize,
    skipped_entries: usize,
    metadata_failures: usize,
    duplicate_groups: usize,
    duplicate_tracks: usize,
    fingerprint_failures: usize,
    truncated: bool,
}

#[derive(Debug)]
struct ScanCandidate {
    path: PathBuf,
    track: ScannedAudioFile,
    version: FileVersion,
}

#[derive(Clone, Debug)]
struct SessionTrack {
    absolute_path: PathBuf,
    track: ScannedAudioFile,
}

#[derive(Debug)]
struct CompletedScan {
    file_versions: HashMap<String, FileVersion>,
    result: FolderScanResult,
    session_tracks: Vec<SessionTrack>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct FileVersion {
    modified_nanos: Option<u128>,
    size_bytes: u64,
}

#[derive(Debug)]
struct ScanSession {
    file_versions: HashMap<String, FileVersion>,
    id: String,
    incremental_scan_active: bool,
    root: PathBuf,
    tracks: HashMap<String, SessionTrack>,
    truncated: bool,
    library_links: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct IncrementalScanResult {
    added_scan_ids: Vec<String>,
    added_tracks: usize,
    removed_scan_ids: Vec<String>,
    removed_tracks: usize,
    scan: FolderScanResult,
    unchanged_tracks: usize,
    updated_scan_ids: Vec<String>,
    updated_tracks: usize,
}

#[derive(Debug, Default)]
struct DesktopState {
    active_maest_analyses: Mutex<HashMap<String, ActiveMaestAnalysis>>,
    metadata_write_history: Mutex<Vec<MetadataWriteRun>>,
    pending_maest_genre_previews: Mutex<HashMap<MaestGenrePreviewKey, MaestGenrePreviewReceipt>>,
    reorganization_history: Mutex<Vec<ReorganizationRun>>,
    scan_session: Mutex<Option<ScanSession>>,
}

#[derive(Debug)]
struct ActiveMaestAnalysis {
    session_id: String,
    scan_id: String,
    cancel: Arc<AtomicBool>,
    progress: maest_inference_pipeline::SharedMaestAnalysisProgress,
    state: ActiveMaestAnalysisState,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ActiveMaestAnalysisState {
    Armed,
    Running,
}

#[derive(Debug)]
struct ActiveMaestOperation<'a> {
    state: &'a DesktopState,
    operation_id: String,
    cancel: Arc<AtomicBool>,
    progress: maest_inference_pipeline::SharedMaestAnalysisProgress,
}

impl Drop for ActiveMaestOperation<'_> {
    fn drop(&mut self) {
        if let Ok(mut active) = self.state.active_maest_analyses.lock() {
            active.remove(&self.operation_id);
        }
    }
}

fn valid_operation_id(value: &str) -> bool {
    value.len() == 36
        && uuid::Uuid::parse_str(value).is_ok_and(|operation_id| {
            operation_id
                .hyphenated()
                .to_string()
                .eq_ignore_ascii_case(value)
        })
}

fn begin_maest_operation(
    state: &DesktopState,
    request: &AnalyzeScannedTrackRequest,
) -> Result<(), AnalyzeScannedTrackError> {
    if request.session_id.is_empty()
        || request.scan_id.is_empty()
        || !valid_operation_id(&request.operation_id)
    {
        return Err(analysis_error(
            "invalid_request",
            None,
            "La solicitud de análisis no es válida.",
        ));
    }
    let cancel = Arc::new(AtomicBool::new(false));
    let progress = Arc::new(Mutex::new(
        maest_inference_pipeline::MaestAnalysisProgress::default(),
    ));
    let mut active = state.active_maest_analyses.lock().map_err(|_| {
        analysis_error(
            "analysis_task_failed",
            None,
            "No se pudo registrar el análisis.",
        )
    })?;
    if active.contains_key(&request.operation_id) {
        return Err(analysis_error(
            "invalid_request",
            None,
            "La operación de análisis ya existe.",
        ));
    }
    if active.len() >= MAX_ACTIVE_MAEST_ANALYSES {
        return Err(analysis_error(
            "analyzer_busy",
            None,
            "Hay demasiados análisis activos.",
        ));
    }
    active.insert(
        request.operation_id.clone(),
        ActiveMaestAnalysis {
            session_id: request.session_id.clone(),
            scan_id: request.scan_id.clone(),
            cancel: Arc::clone(&cancel),
            progress,
            state: ActiveMaestAnalysisState::Armed,
        },
    );
    Ok(())
}

fn start_maest_operation<'a>(
    state: &'a DesktopState,
    request: &AnalyzeScannedTrackRequest,
) -> Result<ActiveMaestOperation<'a>, AnalyzeScannedTrackError> {
    let mut active = state.active_maest_analyses.lock().map_err(|_| {
        analysis_error(
            "analysis_task_failed",
            None,
            "No se pudo proteger el análisis.",
        )
    })?;
    let operation = active
        .get_mut(&request.operation_id)
        .filter(|operation| {
            operation.session_id == request.session_id && operation.scan_id == request.scan_id
        })
        .ok_or_else(|| {
            analysis_error(
                "invalid_request",
                None,
                "La operación de análisis no está preparada.",
            )
        })?;
    if operation.state != ActiveMaestAnalysisState::Armed {
        return Err(analysis_error(
            "invalid_request",
            None,
            "La operación de análisis ya fue consumida.",
        ));
    }
    operation.state = ActiveMaestAnalysisState::Running;
    let cancel = Arc::clone(&operation.cancel);
    let progress = Arc::clone(&operation.progress);
    drop(active);
    Ok(ActiveMaestOperation {
        state,
        operation_id: request.operation_id.clone(),
        cancel,
        progress,
    })
}

fn ensure_maest_operation_active(
    operation: &ActiveMaestOperation<'_>,
) -> Result<(), AnalyzeScannedTrackError> {
    if operation.cancel.load(Ordering::Acquire) {
        Err(analysis_error(
            "analysis_cancelled",
            Some("cancel"),
            "El análisis fue cancelado.",
        ))
    } else {
        Ok(())
    }
}

fn request_maest_cancellation(state: &DesktopState, request: &CancelMaestAnalysisRequest) {
    if !valid_operation_id(&request.operation_id) {
        return;
    }
    if let Ok(active) = state.active_maest_analyses.lock() {
        if let Some(operation) = active.get(&request.operation_id).filter(|operation| {
            operation.session_id == request.session_id && operation.scan_id == request.scan_id
        }) {
            operation.cancel.store(true, Ordering::Release);
        }
    }
}

fn release_maest_operation(state: &DesktopState, request: &CancelMaestAnalysisRequest) {
    if !valid_operation_id(&request.operation_id) {
        return;
    }
    if let Ok(mut active) = state.active_maest_analyses.lock() {
        let exact_armed = active.get(&request.operation_id).is_some_and(|operation| {
            operation.session_id == request.session_id
                && operation.scan_id == request.scan_id
                && operation.state == ActiveMaestAnalysisState::Armed
        });
        if exact_armed {
            active.remove(&request.operation_id);
        } else if let Some(operation) = active.get(&request.operation_id).filter(|operation| {
            operation.session_id == request.session_id && operation.scan_id == request.scan_id
        }) {
            operation.cancel.store(true, Ordering::Release);
        }
    }
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct MaestGenrePreviewKey {
    session_id: String,
    scan_id: String,
    field: &'static str,
    genre: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct MaestGenrePreviewReceipt {
    file_identity: AnalysisFileIdentity,
    file_version: FileVersion,
    fingerprint: [u8; 32],
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnalyzeScannedTrackRequest {
    session_id: String,
    scan_id: String,
    operation_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CancelMaestAnalysisRequest {
    session_id: String,
    scan_id: String,
    operation_id: String,
}

fn maest_analysis_progress(
    state: &DesktopState,
    request: &CancelMaestAnalysisRequest,
) -> Option<maest_inference_pipeline::MaestAnalysisProgress> {
    if !valid_operation_id(&request.operation_id) {
        return None;
    }
    let progress = {
        let active = state.active_maest_analyses.lock().ok()?;
        let operation = active.get(&request.operation_id).filter(|operation| {
            operation.session_id == request.session_id && operation.scan_id == request.scan_id
        })?;
        Arc::clone(&operation.progress)
    };
    let snapshot = *progress.lock().ok()?;
    Some(snapshot)
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeScannedTrackError {
    code: String,
    stage: Option<String>,
    message: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeScannedTrackResult {
    scan_id: String,
    analysis: maest::MaestAnalysisResult,
}

#[derive(Clone, Debug)]
struct ConfirmedAnalysisTrack {
    scan_id: String,
    root: PathBuf,
    absolute_path: PathBuf,
    relative_path: PathBuf,
    expected_size: u64,
    expected_version: FileVersion,
    duration_seconds: Option<f64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct AnalysisFileIdentity {
    first: u64,
    second: u64,
}

#[cfg(unix)]
fn analysis_file_identity(file: &File) -> Option<AnalysisFileIdentity> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata().ok()?;
    Some(AnalysisFileIdentity {
        first: metadata.dev(),
        second: metadata.ino(),
    })
}

#[cfg(windows)]
fn analysis_file_identity(file: &File) -> Option<AnalysisFileIdentity> {
    use std::{ffi::c_void, mem::MaybeUninit, os::windows::io::AsRawHandle};

    #[repr(C)]
    struct FileTime {
        low: u32,
        high: u32,
    }

    #[repr(C)]
    struct ByHandleFileInformation {
        attributes: u32,
        creation_time: FileTime,
        last_access_time: FileTime,
        last_write_time: FileTime,
        volume_serial_number: u32,
        file_size_high: u32,
        file_size_low: u32,
        number_of_links: u32,
        file_index_high: u32,
        file_index_low: u32,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetFileInformationByHandle(
            file: *mut c_void,
            information: *mut ByHandleFileInformation,
        ) -> i32;
    }

    let mut information = MaybeUninit::<ByHandleFileInformation>::uninit();
    // SAFETY: the handle belongs to the live `File`, the output pointer targets a
    // correctly laid-out uninitialized structure, and it is read only on success.
    let succeeded = unsafe {
        GetFileInformationByHandle(file.as_raw_handle().cast(), information.as_mut_ptr())
    };
    if succeeded == 0 {
        return None;
    }
    // SAFETY: a successful call initializes the complete output structure.
    let information = unsafe { information.assume_init() };
    Some(AnalysisFileIdentity {
        first: information.volume_serial_number as u64,
        second: ((information.file_index_high as u64) << 32) | information.file_index_low as u64,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VirtualDjExportResult {
    cancelled: bool,
    exported_tracks: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum OrganizationScheme {
    ArtistAlbum,
    GenreArtist,
    KeyBpm,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReorganizationRequest {
    scheme: OrganizationScheme,
    session_id: String,
    track_ids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReorganizationMove {
    scan_id: String,
    source_path: String,
    target_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReorganizationResult {
    applied: bool,
    moves: Vec<ReorganizationMove>,
    run_id: Option<String>,
}

#[derive(Clone, Debug)]
struct AppliedMove {
    scan_id: String,
    source: PathBuf,
    target: PathBuf,
}

#[derive(Clone, Debug)]
struct ReorganizationRun {
    created_at: u64,
    id: String,
    moves: Vec<AppliedMove>,
    session_id: String,
    undone: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReorganizationHistoryItem {
    created_at: u64,
    move_count: usize,
    run_id: String,
    undone: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MetadataEditInput {
    album: String,
    artist: String,
    bpm: Option<f64>,
    genre: String,
    musical_key: String,
    scan_id: String,
    title: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MetadataWriteRequest {
    edits: Vec<MetadataEditInput>,
    session_id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct MetadataFieldChange {
    after: Option<String>,
    before: Option<String>,
    field: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct MetadataFilePreview {
    changes: Vec<MetadataFieldChange>,
    relative_path: String,
    scan_id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct MetadataWritePreview {
    files: Vec<MetadataFilePreview>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MetadataWriteResult {
    applied_files: usize,
    run_id: Option<String>,
    updated_tracks: Vec<ScannedAudioFile>,
}

#[derive(Clone, Debug)]
struct MetadataBackup {
    backup_path: PathBuf,
    original_path: PathBuf,
    scan_id: String,
    written_fingerprint: [u8; 32],
}

#[derive(Clone, Debug)]
struct MetadataWriteRun {
    backups: Vec<MetadataBackup>,
    created_at: u64,
    id: String,
    session_id: String,
    undone: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MetadataWriteHistoryItem {
    created_at: u64,
    file_count: usize,
    run_id: String,
    undone: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MaestGenreWriteRequest {
    session_id: String,
    scan_id: String,
    genre: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MaestSubgenreWriteRequest {
    session_id: String,
    scan_id: String,
    subgenre: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct MaestGenreWritePreview {
    scan_id: String,
    field: &'static str,
    before: Option<String>,
    after: String,
    changed: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct MaestGenreWriteResult {
    applied_files: usize,
    run_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct SafeMetadataWriteError {
    code: &'static str,
    message: &'static str,
}

impl SafeMetadataWriteError {
    fn new(code: &'static str, message: &'static str) -> Self {
        Self { code, message }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VirtualDjCrateInput {
    hierarchy: Vec<String>,
    name: String,
    track_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VirtualDjBatchExportResult {
    backed_up_files: usize,
    cancelled: bool,
    exported_lists: usize,
    exported_tracks: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RekordboxCrateInput {
    hierarchy: Vec<String>,
    id: String,
    name: String,
    track_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RekordboxExportPreview {
    duplicate_names: Vec<String>,
    excluded_tracks: usize,
    linked_tracks: usize,
    playlists: usize,
    total_tracks: usize,
    unlinked_track_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RekordboxExportResult {
    cancelled: bool,
    exported_playlists: usize,
    exported_tracks: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VirtualDjImportedList {
    linked_track_ids: Vec<String>,
    name: String,
    relative_path: String,
    unresolved_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VirtualDjImportPreview {
    cancelled: bool,
    lists: Vec<VirtualDjImportedList>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopUpdateStatus {
    available: bool,
    notes: Option<String>,
    version: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LibraryLinkCandidate {
    file_fingerprint: String,
    file_size: u64,
    track_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
struct LocalFileIdentity {
    fingerprint: String,
    size: u64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
struct LocalTrackAliases {
    anchor: LocalFileIdentity,
    aliases: Vec<LocalFileIdentity>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
struct LocalLibraryFileAliases {
    version: u8,
    tracks: BTreeMap<String, LocalTrackAliases>,
}

impl Default for LocalLibraryFileAliases {
    fn default() -> Self {
        Self {
            version: LIBRARY_FILE_ALIASES_VERSION,
            tracks: BTreeMap::new(),
        }
    }
}

#[derive(Debug)]
struct LibraryLinkMatch {
    fingerprint_failures: usize,
    links: HashMap<String, String>,
    unmatched_tracks: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryTrackLink {
    scan_id: String,
    track_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryLinkResult {
    fingerprint_failures: usize,
    linked_tracks: usize,
    links: Vec<LibraryTrackLink>,
    unmatched_tracks: usize,
}

fn audio_extension(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    AUDIO_EXTENSIONS
        .contains(&extension.as_str())
        .then_some(extension)
}

fn cleaned_text(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

fn parse_bpm(value: &str) -> Option<f64> {
    let bpm = value.trim().replace(',', ".").parse::<f64>().ok()?;
    (20.0..=300.0).contains(&bpm).then_some(bpm)
}

fn parse_mp4_bpm_value(value: &AtomData) -> Option<f64> {
    match value {
        AtomData::SignedInteger(value) => parse_bpm(&value.to_string()),
        AtomData::UnsignedInteger(value) => parse_bpm(&value.to_string()),
        AtomData::UTF8(value) | AtomData::UTF16(value) => parse_bpm(value),
        AtomData::Unknown { data, .. } if !data.is_empty() && data.len() <= 4 => {
            let value = data.iter().try_fold(0_u32, |value, byte| {
                value.checked_mul(256)?.checked_add(*byte as u32)
            })?;
            parse_bpm(&value.to_string())
        }
        _ => None,
    }
}

fn mp4_text(ilst: &Ilst, key: ItemKey) -> Option<String> {
    let ident = AtomIdent::try_from(key).ok()?;
    let atom = ilst.get(&ident)?;

    atom.data().find_map(|value| match value {
        AtomData::UTF8(value) | AtomData::UTF16(value) => cleaned_text(value),
        _ => None,
    })
}

fn read_mp4_audio_metadata(path: &Path) -> Result<AudioMetadata, String> {
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mp4_file =
        Mp4File::read_from(&mut file, ParseOptions::new()).map_err(|error| error.to_string())?;
    let duration = mp4_file.properties().duration().as_secs_f64();
    let mut metadata = AudioMetadata {
        duration_seconds: (duration > 0.0).then_some(duration),
        ..AudioMetadata::default()
    };

    if let Some(ilst) = mp4_file.ilst() {
        metadata.title = ilst.title().as_deref().and_then(cleaned_text);
        metadata.artist = ilst.artist().as_deref().and_then(cleaned_text);
        metadata.album = ilst.album().as_deref().and_then(cleaned_text);
        metadata.genre = ilst.genre().as_deref().and_then(cleaned_text);
        metadata.subgenre = mp4_text(ilst, ItemKey::ContentGroup);
        metadata.bpm = mp4_text(ilst, ItemKey::Bpm)
            .as_deref()
            .and_then(parse_bpm)
            .or_else(|| {
                ilst.get(&AtomIdent::Fourcc(*b"tmpo"))
                    .and_then(|atom| atom.data().find_map(parse_mp4_bpm_value))
            });
        metadata.musical_key = mp4_text(ilst, ItemKey::InitialKey);
    }

    Ok(metadata)
}

fn read_audio_metadata(path: &Path) -> Result<AudioMetadata, String> {
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("m4a"))
    {
        return read_mp4_audio_metadata(path);
    }

    let tagged_file = read_from_path(path).map_err(|error| error.to_string())?;
    let duration = tagged_file.properties().duration().as_secs_f64();
    let mut metadata = AudioMetadata {
        duration_seconds: (duration > 0.0).then_some(duration),
        ..AudioMetadata::default()
    };

    if let Some(tag) = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())
    {
        metadata.title = tag.title().as_deref().and_then(cleaned_text);
        metadata.artist = tag.artist().as_deref().and_then(cleaned_text);
        metadata.album = tag.album().as_deref().and_then(cleaned_text);
        metadata.genre = tag.genre().as_deref().and_then(cleaned_text);
        metadata.subgenre = tag.get_string(ItemKey::ContentGroup).and_then(cleaned_text);
        metadata.bpm = tag
            .get_string(ItemKey::Bpm)
            .or_else(|| tag.get_string(ItemKey::IntegerBpm))
            .and_then(parse_bpm);
        metadata.musical_key = tag.get_string(ItemKey::InitialKey).and_then(cleaned_text);
    }

    Ok(metadata)
}

fn hash_file(path: &Path, expected_size: u64) -> Result<[u8; 32], String> {
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    hash_open_file(&file, expected_size)
}

fn hash_open_file(file: &File, expected_size: u64) -> Result<[u8; 32], String> {
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut bytes_read = 0_u64;

    loop {
        let count = reader
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        bytes_read = bytes_read
            .checked_add(count as u64)
            .ok_or_else(|| "El archivo excede el tamaño compatible.".to_owned())?;
        if bytes_read > expected_size {
            return Err("El archivo cambió durante el escaneo.".to_owned());
        }
        hasher.update(&buffer[..count]);
    }

    if bytes_read != expected_size {
        return Err("El archivo cambió durante el escaneo.".to_owned());
    }

    Ok(hasher.finalize().into())
}

fn mark_exact_duplicates(candidates: &mut [ScanCandidate]) -> (usize, usize, usize) {
    for candidate in candidates.iter_mut() {
        candidate.track.duplicate_group = None;
    }
    let mut candidates_by_size: BTreeMap<u64, Vec<usize>> = BTreeMap::new();
    for (index, candidate) in candidates.iter().enumerate() {
        candidates_by_size
            .entry(candidate.track.size_bytes)
            .or_default()
            .push(index);
    }

    let mut duplicate_sets = Vec::new();
    let mut fingerprint_failures = 0;

    for same_size in candidates_by_size
        .into_values()
        .filter(|group| group.len() > 1)
    {
        let mut by_fingerprint: HashMap<[u8; 32], Vec<usize>> = HashMap::new();

        for index in same_size {
            let candidate = &candidates[index];
            match hash_file(&candidate.path, candidate.track.size_bytes) {
                Ok(fingerprint) => {
                    by_fingerprint.entry(fingerprint).or_default().push(index);
                }
                Err(_) => fingerprint_failures += 1,
            }
        }

        duplicate_sets.extend(by_fingerprint.into_values().filter(|group| group.len() > 1));
    }

    for group in &mut duplicate_sets {
        group.sort_by_key(|index| candidates[*index].track.relative_path.to_ascii_lowercase());
    }
    duplicate_sets.sort_by_key(|group| {
        candidates[group[0]]
            .track
            .relative_path
            .to_ascii_lowercase()
    });

    let duplicate_tracks = duplicate_sets.iter().map(Vec::len).sum();
    for (group_index, group) in duplicate_sets.iter().enumerate() {
        let label = format!("DUP-{:03}", group_index + 1);
        for index in group {
            candidates[*index].track.duplicate_group = Some(label.clone());
        }
    }

    (duplicate_sets.len(), duplicate_tracks, fingerprint_failures)
}

fn scan_music_folder(root: &Path, session_id: String) -> Result<CompletedScan, String> {
    scan_music_folder_with_previous(root, session_id, None, None)
}

fn file_version(metadata: &fs::Metadata) -> FileVersion {
    FileVersion {
        modified_nanos: metadata
            .modified()
            .ok()
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_nanos()),
        size_bytes: metadata.len(),
    }
}

fn scan_music_folder_with_previous(
    root: &Path,
    session_id: String,
    previous_tracks: Option<&HashMap<String, SessionTrack>>,
    previous_versions: Option<&HashMap<String, FileVersion>>,
) -> Result<CompletedScan, String> {
    if !root.is_dir() {
        return Err("La selección no es una carpeta accesible.".to_owned());
    }

    let root_name = root
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("Carpeta seleccionada")
        .to_owned();

    let mut pending = vec![root.to_path_buf()];
    let mut candidates = Vec::new();
    let mut examined_entries = 0;
    let mut skipped_entries = 0;
    let mut metadata_failures = 0;
    let mut truncated = false;
    let previous_by_path = previous_tracks
        .map(|tracks| {
            tracks
                .values()
                .map(|track| (track.track.relative_path.clone(), track.clone()))
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default();

    'folders: while let Some(directory) = pending.pop() {
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if directory == root => {
                return Err(format!("No se pudo leer la carpeta seleccionada: {error}"));
            }
            Err(_) => {
                skipped_entries += 1;
                continue;
            }
        };

        for entry in entries {
            if examined_entries >= MAX_ENTRIES || candidates.len() >= MAX_TRACKS {
                truncated = true;
                break 'folders;
            }
            examined_entries += 1;

            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    skipped_entries += 1;
                    continue;
                }
            };
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => {
                    skipped_entries += 1;
                    continue;
                }
            };

            if file_type.is_symlink() {
                skipped_entries += 1;
                continue;
            }

            let path = entry.path();
            if file_type.is_dir() {
                if entry.file_name() == METADATA_BACKUP_DIRECTORY {
                    continue;
                }
                pending.push(path);
                continue;
            }
            if !file_type.is_file() {
                continue;
            }

            let Some(extension) = audio_extension(&path) else {
                continue;
            };
            let file_metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(_) => {
                    skipped_entries += 1;
                    continue;
                }
            };
            let relative_path = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Archivo sin nombre")
                .to_owned();
            let version = file_version(&file_metadata);
            let version_key = relative_path.clone();
            let previous_track = previous_by_path.get(&version_key);
            let unchanged = previous_track.is_some()
                && version.modified_nanos.is_some()
                && previous_versions
                    .and_then(|versions| versions.get(&version_key))
                    .is_some_and(|previous| previous == &version);

            if unchanged {
                let mut track = previous_track
                    .expect("an unchanged version always has a previous track")
                    .track
                    .clone();
                track.name = name;
                track.relative_path = relative_path;
                track.extension = extension;
                track.size_bytes = file_metadata.len();
                if !track.metadata_read {
                    metadata_failures += 1;
                }
                candidates.push(ScanCandidate {
                    path,
                    track,
                    version,
                });
                continue;
            }

            let (metadata, metadata_read) = match read_audio_metadata(&path) {
                Ok(metadata) => (metadata, true),
                Err(_) => {
                    metadata_failures += 1;
                    (AudioMetadata::default(), false)
                }
            };

            candidates.push(ScanCandidate {
                path,
                track: ScannedAudioFile {
                    scan_id: previous_track
                        .map(|track| track.track.scan_id.clone())
                        .unwrap_or_default(),
                    name,
                    relative_path,
                    extension,
                    size_bytes: file_metadata.len(),
                    metadata_read,
                    title: metadata.title,
                    artist: metadata.artist,
                    album: metadata.album,
                    genre: metadata.genre,
                    duration_seconds: metadata.duration_seconds,
                    bpm: metadata.bpm,
                    musical_key: metadata.musical_key,
                    duplicate_group: None,
                },
                version,
            });
        }
    }

    candidates.sort_by_key(|candidate| candidate.track.relative_path.to_ascii_lowercase());
    let (duplicate_groups, duplicate_tracks, fingerprint_failures) =
        mark_exact_duplicates(&mut candidates);
    for candidate in &mut candidates {
        if candidate.track.scan_id.is_empty() {
            candidate.track.scan_id =
                create_track_path_id(&session_id, &candidate.track.relative_path);
        }
    }
    let file_versions = candidates
        .iter()
        .map(|candidate| {
            (
                candidate.track.relative_path.clone(),
                candidate.version.clone(),
            )
        })
        .collect();
    let session_tracks = candidates
        .iter()
        .map(|candidate| SessionTrack {
            absolute_path: candidate.path.clone(),
            track: candidate.track.clone(),
        })
        .collect();
    let tracks = candidates
        .into_iter()
        .map(|candidate| candidate.track)
        .collect();

    Ok(CompletedScan {
        file_versions,
        result: FolderScanResult {
            session_id,
            root_name,
            tracks,
            examined_entries,
            skipped_entries,
            metadata_failures,
            duplicate_groups,
            duplicate_tracks,
            fingerprint_failures,
            truncated,
        },
        session_tracks,
    })
}

fn create_track_path_id(session_id: &str, relative_path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(session_id.as_bytes());
    hasher.update(relative_path.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn count_incremental_changes(
    previous: &HashMap<String, FileVersion>,
    current: &HashMap<String, FileVersion>,
) -> (usize, usize, usize, usize) {
    let added = current
        .keys()
        .filter(|path| !previous.contains_key(*path))
        .count();
    let removed = previous
        .keys()
        .filter(|path| !current.contains_key(*path))
        .count();
    let updated = current
        .iter()
        .filter(|(path, version)| {
            previous
                .get(*path)
                .is_some_and(|previous_version| previous_version != *version)
        })
        .count();
    let unchanged = current.len().saturating_sub(added + updated);
    (added, removed, updated, unchanged)
}

fn create_scan_session_id(root: &Path) -> Result<String, String> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "No se pudo crear una sesión segura para el escaneo.".to_owned())?;
    let mut hasher = Sha256::new();
    hasher.update(root.to_string_lossy().as_bytes());
    hasher.update(elapsed.as_nanos().to_le_bytes());
    hasher.update(std::process::id().to_le_bytes());
    Ok(format!("{:x}", hasher.finalize()))
}

fn xml_escape_attribute(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());

    for character in value.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&apos;"),
            '\t' | '\n' | '\r' | '\u{20}'.. => escaped.push(character),
            _ => escaped.push('\u{fffd}'),
        }
    }

    escaped
}

fn export_path_text(path: &Path) -> Result<&str, String> {
    path.to_str().ok_or_else(|| {
        "Una ruta contiene bytes que no son UTF-8 y no puede exportarse de forma segura.".to_owned()
    })
}

fn push_xml_attribute(xml: &mut String, name: &str, value: &str) {
    xml.push(' ');
    xml.push_str(name);
    xml.push_str("=\"");
    xml.push_str(&xml_escape_attribute(value));
    xml.push('"');
}

fn build_virtualdj_list_xml(tracks: &[SessionTrack]) -> Result<String, String> {
    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<VirtualFolder noDuplicates=\"yes\" singleDrive=\"no\" ordered=\"yes\">\n",
    );

    for (index, session_track) in tracks.iter().enumerate() {
        let track = &session_track.track;
        xml.push_str("  <song");
        push_xml_attribute(
            &mut xml,
            "path",
            export_path_text(&session_track.absolute_path)?,
        );
        push_xml_attribute(&mut xml, "size", &track.size_bytes.to_string());
        if let Some(artist) = track.artist.as_deref() {
            push_xml_attribute(&mut xml, "artist", artist);
        }
        if let Some(title) = track.title.as_deref() {
            push_xml_attribute(&mut xml, "title", title);
        }
        if let Some(duration) = track.duration_seconds {
            push_xml_attribute(&mut xml, "songlength", &format!("{duration:.3}"));
        }
        if let Some(bpm) = track.bpm {
            push_xml_attribute(&mut xml, "bpm", &format!("{bpm:.3}"));
        }
        if let Some(key) = track.musical_key.as_deref() {
            push_xml_attribute(&mut xml, "key", key);
        }
        push_xml_attribute(&mut xml, "idx", &index.to_string());
        xml.push_str(" />\n");
    }

    xml.push_str("</VirtualFolder>\n");
    Ok(xml)
}

/// Rekordbox XML requires a URI, not an OS path.  This deliberately accepts
/// only absolute UTF-8 paths and percent-encodes bytes exactly once.
fn rekordbox_file_uri(path: &Path) -> Result<String, String> {
    let value = export_path_text(path)?;
    let normalized = value.replace('\\', "/");
    let path = if normalized.starts_with("//") {
        normalized
    } else if normalized.len() >= 3
        && normalized.as_bytes()[1] == b':'
        && normalized.as_bytes()[2] == b'/'
        && normalized.as_bytes()[0].is_ascii_alphabetic()
    {
        format!("/{normalized}")
    } else if normalized.starts_with('/') {
        normalized
    } else {
        return Err("La ruta local no es absoluta y no puede exportarse a Rekordbox.".to_owned());
    };
    let mut encoded = String::with_capacity(path.len());
    for byte in path.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'-' | b'.' | b'_' | b'~' | b':') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    Ok(format!("file://localhost{encoded}"))
}

fn rekordbox_rating(_rating: Option<u8>) -> Option<u8> {
    _rating.map(|rating| match rating.min(5) {
        0 => 0,
        1 => 51,
        2 => 102,
        3 => 153,
        4 => 204,
        _ => 255,
    })
}

fn build_rekordbox_xml(
    crates: &[(RekordboxCrateInput, Vec<SessionTrack>)],
) -> Result<String, String> {
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<DJ_PLAYLISTS Version=\"1.0.0\">\n  <PRODUCT Name=\"DJOrganizer\" Version=\"1.0\" Company=\"DJOrganizer\" />\n");
    let mut by_scan_id = BTreeMap::<String, (usize, SessionTrack)>::new();
    for (_, tracks) in crates {
        for track in tracks {
            if !by_scan_id.contains_key(&track.track.scan_id) {
                let next_id = by_scan_id.len() + 1;
                by_scan_id.insert(track.track.scan_id.clone(), (next_id, track.clone()));
            }
        }
    }
    xml.push_str(&format!(
        "  <COLLECTION Entries=\"{}\">\n",
        by_scan_id.len()
    ));
    for (_, (id, session_track)) in &by_scan_id {
        let track = &session_track.track;
        xml.push_str("    <TRACK");
        push_xml_attribute(&mut xml, "TrackID", &id.to_string());
        push_xml_attribute(
            &mut xml,
            "Location",
            &rekordbox_file_uri(&session_track.absolute_path)?,
        );
        for (key, value) in [
            ("Name", track.title.as_deref()),
            ("Artist", track.artist.as_deref()),
            ("Album", track.album.as_deref()),
            ("Genre", track.genre.as_deref()),
            ("Tonality", track.musical_key.as_deref()),
        ] {
            if let Some(value) = value.filter(|value| !value.is_empty()) {
                push_xml_attribute(&mut xml, key, value);
            }
        }
        if let Some(seconds) = track.duration_seconds {
            push_xml_attribute(&mut xml, "TotalTime", &(seconds.round() as u64).to_string());
        }
        if let Some(bpm) = track.bpm {
            push_xml_attribute(&mut xml, "AverageBpm", &format!("{bpm:.2}"));
        }
        xml.push_str(" />\n");
    }
    #[derive(Default)]
    struct Folder<'a> {
        children: BTreeMap<String, Folder<'a>>,
        playlists: Vec<(&'a RekordboxCrateInput, &'a Vec<SessionTrack>)>,
    }
    fn emit_folder(
        xml: &mut String,
        name: &str,
        folder: &Folder<'_>,
        ids: &BTreeMap<String, (usize, SessionTrack)>,
        indent: usize,
    ) {
        let pad = " ".repeat(indent);
        xml.push_str(&format!(
            "{pad}<NODE Type=\"0\" Name=\"{}",
            xml_escape_attribute(name)
        ));
        xml.push_str(&format!(
            "\" Count=\"{}\">\n",
            folder.children.len() + folder.playlists.len()
        ));
        for (child_name, child) in &folder.children {
            emit_folder(xml, child_name, child, ids, indent + 2);
        }
        for (crate_input, tracks) in &folder.playlists {
            xml.push_str(&format!("{}  <NODE Type=\"1\"", pad));
            push_xml_attribute(xml, "Name", &crate_input.name);
            push_xml_attribute(xml, "KeyType", "0");
            push_xml_attribute(xml, "Entries", &tracks.len().to_string());
            xml.push_str(">\n");
            for track in *tracks {
                let id = ids.get(&track.track.scan_id).expect("selected track ID").0;
                xml.push_str(&format!("{}    <TRACK Key=\"{id}\" />\n", pad));
            }
            xml.push_str(&format!("{}  </NODE>\n", pad));
        }
        xml.push_str(&format!("{pad}</NODE>\n"));
    }
    let mut root = Folder::default();
    for (crate_input, tracks) in crates {
        let mut folder = &mut root;
        for level in &crate_input.hierarchy {
            folder = folder.children.entry(level.clone()).or_default();
        }
        folder.playlists.push((crate_input, tracks));
    }
    xml.push_str("  </COLLECTION>\n  <PLAYLISTS>\n");
    emit_folder(&mut xml, "ROOT", &root, &by_scan_id, 4);
    xml.push_str("  </PLAYLISTS>\n</DJ_PLAYLISTS>\n");
    if xml.len() > MAX_REKORDBOX_XML_BYTES {
        return Err("El XML estimado supera el límite de 20 MB.".to_owned());
    }
    Ok(xml)
}

fn m3u8_label(track: &ScannedAudioFile) -> String {
    let label = match (track.artist.as_deref(), track.title.as_deref()) {
        (Some(artist), Some(title)) => format!("{artist} - {title}"),
        (None, Some(title)) => title.to_owned(),
        (Some(artist), None) => format!("{artist} - {}", track.name),
        (None, None) => track.name.clone(),
    };

    label.replace(|character| matches!(character, '\r' | '\n'), " ")
}

fn build_virtualdj_m3u8(tracks: &[SessionTrack]) -> Result<String, String> {
    let mut m3u8 = String::from("#EXTM3U\n");

    for session_track in tracks {
        let absolute_path = export_path_text(&session_track.absolute_path)?;
        if absolute_path.contains(|character| matches!(character, '\r' | '\n')) {
            return Err(
                "Una ruta contiene un salto de línea incompatible con M3U8. Usa la exportación XML."
                    .to_owned(),
            );
        }
        let duration = session_track
            .track
            .duration_seconds
            .map(|seconds| seconds.round() as i64)
            .unwrap_or(-1);
        m3u8.push_str(&format!(
            "#EXTINF:{duration},{}\n{}\n",
            m3u8_label(&session_track.track),
            absolute_path
        ));
    }

    Ok(m3u8)
}

fn safe_export_file_name(list_name: &str) -> String {
    let sanitized: String = list_name
        .chars()
        .map(|character| match character {
            '\0'..='\u{1f}' | '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            _ => character,
        })
        .collect();
    let sanitized = sanitized
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_matches(|character| matches!(character, '.' | ' '))
        .chars()
        .take(80)
        .collect::<String>();
    let sanitized = sanitized.trim_matches(|character| matches!(character, '.' | ' '));
    if sanitized.is_empty() {
        "DJOrganizer".to_owned()
    } else {
        sanitized.to_owned()
    }
}

fn safe_path_segment(value: Option<&str>, fallback: &str) -> String {
    let mut sanitized = value
        .unwrap_or_default()
        .trim()
        .chars()
        .map(|character| match character {
            '\0'..='\u{1f}' | '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            _ => character,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim_start_matches('.')
        .trim()
        .trim_end_matches(&['.', ' '][..])
        .chars()
        .take(80)
        .collect::<String>();
    if sanitized.is_empty() {
        sanitized = fallback.to_owned();
    }
    let base = sanitized
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(
        base.as_str(),
        "con"
            | "prn"
            | "aux"
            | "nul"
            | "com1"
            | "com2"
            | "com3"
            | "com4"
            | "com5"
            | "com6"
            | "com7"
            | "com8"
            | "com9"
            | "lpt1"
            | "lpt2"
            | "lpt3"
            | "lpt4"
            | "lpt5"
            | "lpt6"
            | "lpt7"
            | "lpt8"
            | "lpt9"
    ) {
        sanitized.insert(0, '_');
    }
    sanitized
}

fn organization_folders(track: &ScannedAudioFile, scheme: &OrganizationScheme) -> Vec<String> {
    match scheme {
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
        OrganizationScheme::ArtistAlbum => vec![
            safe_path_segment(track.artist.as_deref(), "Artista desconocido"),
            safe_path_segment(track.album.as_deref(), "Sin álbum"),
        ],
    }
}

fn build_reorganization_plan(
    session: &ScanSession,
    track_ids: &[String],
    scheme: &OrganizationScheme,
) -> Result<Vec<AppliedMove>, String> {
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

        let folders = organization_folders(&session_track.track, scheme);
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

fn selected_session_tracks_from_session(
    session: &ScanSession,
    track_ids: &[String],
) -> Result<Vec<SessionTrack>, String> {
    if track_ids.is_empty() || track_ids.len() > MAX_TRACKS {
        return Err("Selecciona entre 1 y 10.000 pistas.".to_owned());
    }
    let mut unique_ids = HashSet::with_capacity(track_ids.len());
    track_ids
        .iter()
        .map(|track_id| {
            if !unique_ids.insert(track_id) {
                return Err("La selección contiene una pista repetida.".to_owned());
            }
            session
                .tracks
                .get(track_id)
                .cloned()
                .ok_or_else(|| "La selección no pertenece al escaneo activo.".to_owned())
        })
        .collect()
}

fn relative_display(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn rollback_moves(moves: &[AppliedMove]) {
    for applied in moves.iter().rev() {
        if applied.target.exists() && !applied.source.exists() {
            if let Some(parent) = applied.source.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let _ = fs::rename(&applied.target, &applied.source);
        }
    }
}

fn operation_id(label: &str) -> Result<String, String> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "No se pudo crear el identificador de la operación.".to_owned())?;
    let mut hasher = Sha256::new();
    hasher.update(label.as_bytes());
    hasher.update(elapsed.as_nanos().to_le_bytes());
    Ok(format!("{:x}", hasher.finalize()))
}

fn normalized_metadata_text(
    value: &str,
    field: &str,
    max_chars: usize,
) -> Result<Option<String>, String> {
    let value = value.trim();
    if value.chars().any(char::is_control) {
        return Err(format!(
            "{field} contiene caracteres de control no permitidos."
        ));
    }
    if value.chars().count() > max_chars {
        return Err(format!(
            "{field} supera el límite de {max_chars} caracteres."
        ));
    }
    Ok((!value.is_empty()).then(|| value.to_owned()))
}

fn normalized_metadata_edit(edit: &MetadataEditInput) -> Result<MetadataEditInput, String> {
    if edit.scan_id.is_empty() || edit.scan_id.len() > 128 {
        return Err("La edición contiene un identificador de pista no válido.".to_owned());
    }
    let bpm = match edit.bpm {
        Some(bpm) if bpm.is_finite() && (20.0..=300.0).contains(&bpm) => Some(bpm),
        Some(_) => return Err("El BPM debe estar entre 20 y 300.".to_owned()),
        None => None,
    };
    Ok(MetadataEditInput {
        album: normalized_metadata_text(&edit.album, "El álbum", 300)?.unwrap_or_default(),
        artist: normalized_metadata_text(&edit.artist, "El artista", 300)?.unwrap_or_default(),
        bpm,
        genre: normalized_metadata_text(&edit.genre, "El género", 120)?.unwrap_or_default(),
        musical_key: normalized_metadata_text(&edit.musical_key, "La tonalidad", 24)?
            .unwrap_or_default(),
        scan_id: edit.scan_id.clone(),
        title: normalized_metadata_text(&edit.title, "El título", 300)?.unwrap_or_default(),
    })
}

fn bpm_metadata_text(value: f64) -> String {
    let text = format!("{value:.3}");
    text.trim_end_matches('0').trim_end_matches('.').to_owned()
}

fn optional_bpm_text(value: Option<f64>) -> Option<String> {
    value.map(bpm_metadata_text)
}

fn metadata_change(
    changes: &mut Vec<MetadataFieldChange>,
    field: &str,
    before: Option<String>,
    after: Option<String>,
) {
    if before != after {
        changes.push(MetadataFieldChange {
            after,
            before,
            field: field.to_owned(),
        });
    }
}

fn metadata_file_changes(
    track: &ScannedAudioFile,
    edit: &MetadataEditInput,
) -> Vec<MetadataFieldChange> {
    let mut changes = Vec::new();
    metadata_change(
        &mut changes,
        "title",
        track.title.clone(),
        cleaned_text(&edit.title),
    );
    metadata_change(
        &mut changes,
        "artist",
        track.artist.clone(),
        cleaned_text(&edit.artist),
    );
    metadata_change(
        &mut changes,
        "album",
        track.album.clone(),
        cleaned_text(&edit.album),
    );
    metadata_change(
        &mut changes,
        "genre",
        track.genre.clone(),
        cleaned_text(&edit.genre),
    );
    metadata_change(
        &mut changes,
        "bpm",
        optional_bpm_text(track.bpm),
        optional_bpm_text(edit.bpm),
    );
    metadata_change(
        &mut changes,
        "musicalKey",
        track.musical_key.clone(),
        cleaned_text(&edit.musical_key),
    );
    changes
}

fn ensure_metadata_writable(path: &Path) -> Result<(), String> {
    let tagged_file = read_from_path(path)
        .map_err(|error| format!("No se pudo abrir el audio para editar etiquetas: {error}"))?;
    let tag_type = tagged_file.primary_tag_type();
    if !tagged_file.tag_support(tag_type).is_writable() {
        return Err("El contenedor de audio no admite escritura segura de etiquetas.".to_owned());
    }
    Ok(())
}

fn confirmed_maest_field_preview(
    session: &ScanSession,
    request: &MaestGenreWriteRequest,
    field: &'static str,
) -> Result<
    (
        MaestGenreWritePreview,
        SessionTrack,
        MaestGenrePreviewReceipt,
    ),
    SafeMetadataWriteError,
> {
    let genre = normalized_metadata_text(&request.genre, "El género", 120)
        .map_err(|_| SafeMetadataWriteError::new("invalid_genre", "El género no es válido."))?
        .ok_or_else(|| SafeMetadataWriteError::new("invalid_genre", "El género no es válido."))?;
    if request.scan_id.is_empty() || request.scan_id.len() > 128 {
        return Err(SafeMetadataWriteError::new(
            "track_not_in_session",
            "La pista no pertenece al escaneo activo.",
        ));
    }
    if !session
        .library_links
        .values()
        .any(|scan_id| scan_id == &request.scan_id)
    {
        return Err(SafeMetadataWriteError::new(
            "track_not_in_session",
            "La pista no está vinculada a la biblioteca.",
        ));
    }
    let track = session
        .tracks
        .get(&request.scan_id)
        .cloned()
        .ok_or_else(|| {
            SafeMetadataWriteError::new("track_unavailable", "La pista ya no está disponible.")
        })?;
    let file = File::open(&track.absolute_path).map_err(|_| {
        SafeMetadataWriteError::new("track_unavailable", "El archivo ya no está disponible.")
    })?;
    let current = file.metadata().map_err(|_| {
        SafeMetadataWriteError::new("track_unavailable", "El archivo ya no está disponible.")
    })?;
    if !current.is_file() {
        return Err(SafeMetadataWriteError::new(
            "track_unavailable",
            "La pista ya no es un archivo regular.",
        ));
    }
    let expected = session
        .file_versions
        .get(&track.track.relative_path)
        .ok_or_else(|| {
            SafeMetadataWriteError::new("track_changed", "El archivo cambió desde el escaneo.")
        })?;
    if file_version(&current) != *expected {
        return Err(SafeMetadataWriteError::new(
            "track_changed",
            "El archivo cambió desde el escaneo.",
        ));
    }
    if current.permissions().readonly() {
        return Err(SafeMetadataWriteError::new(
            "file_not_writable",
            "El archivo no se puede escribir.",
        ));
    }
    ensure_metadata_writable(&track.absolute_path).map_err(|_| {
        SafeMetadataWriteError::new(
            "tag_not_writable",
            "El formato no admite escritura de etiquetas.",
        )
    })?;
    if field == "subgenre" && !subgenre_tag_is_writable(&track.absolute_path) {
        return Err(SafeMetadataWriteError::new(
            "tag_not_writable",
            "El formato no admite un subgénero independiente.",
        ));
    }
    let file_identity = analysis_file_identity(&file).ok_or_else(|| {
        SafeMetadataWriteError::new("track_changed", "No se pudo confirmar el archivo.")
    })?;
    let fingerprint = hash_open_file(&file, current.len()).map_err(|_| {
        SafeMetadataWriteError::new("track_changed", "El archivo cambió al previsualizar.")
    })?;
    let before = if field == "subgenre" {
        read_audio_metadata(&track.absolute_path)
            .map_err(|_| {
                SafeMetadataWriteError::new("track_changed", "No se pudieron releer las etiquetas.")
            })?
            .subgenre
    } else {
        track.track.genre.clone()
    };
    Ok((
        MaestGenreWritePreview {
            scan_id: request.scan_id.clone(),
            field,
            changed: before.as_deref() != Some(genre.as_str()),
            before,
            after: genre,
        },
        track,
        MaestGenrePreviewReceipt {
            file_identity,
            file_version: file_version(&current),
            fingerprint,
        },
    ))
}

fn confirmed_maest_genre_preview(
    session: &ScanSession,
    request: &MaestGenreWriteRequest,
) -> Result<
    (
        MaestGenreWritePreview,
        SessionTrack,
        MaestGenrePreviewReceipt,
    ),
    SafeMetadataWriteError,
> {
    confirmed_maest_field_preview(session, request, "genre")
}

fn confirmed_maest_subgenre_preview(
    session: &ScanSession,
    request: &MaestSubgenreWriteRequest,
) -> Result<
    (
        MaestGenreWritePreview,
        SessionTrack,
        MaestGenrePreviewReceipt,
    ),
    SafeMetadataWriteError,
> {
    confirmed_maest_field_preview(
        session,
        &MaestGenreWriteRequest {
            session_id: request.session_id.clone(),
            scan_id: request.scan_id.clone(),
            genre: request.subgenre.clone(),
        },
        "subgenre",
    )
}

fn write_genre_only(path: &Path, genre: &str) -> Result<AudioMetadata, &'static str> {
    let before = read_audio_metadata(path).map_err(|_| "write_failed")?;
    let mut tagged_file = read_from_path(path).map_err(|_| "write_failed")?;
    let tag_type = tagged_file.primary_tag_type();
    if !tagged_file.tag_support(tag_type).is_writable() {
        return Err("tag_not_writable");
    }
    if tagged_file.primary_tag().is_none() {
        tagged_file.insert_tag(Tag::new(tag_type));
    }
    tagged_file
        .primary_tag_mut()
        .ok_or("tag_not_writable")?
        .set_genre(genre.to_owned());
    tagged_file
        .save_to_path(path, WriteOptions::default())
        .map_err(|_| "write_failed")?;
    let after = read_audio_metadata(path).map_err(|_| "verification_failed")?;
    if after.genre.as_deref() != Some(genre)
        || after.title != before.title
        || after.artist != before.artist
        || after.album != before.album
        || after.bpm != before.bpm
        || after.musical_key != before.musical_key
    {
        return Err("verification_failed");
    }
    Ok(after)
}

fn subgenre_tag_is_writable(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "flac" | "m4a" | "mp3" | "ogg" | "opus"
            )
        })
}

fn write_subgenre_only(path: &Path, subgenre: &str) -> Result<AudioMetadata, &'static str> {
    if !subgenre_tag_is_writable(path) {
        return Err("tag_not_writable");
    }
    let before = read_audio_metadata(path).map_err(|_| "write_failed")?;
    let mut tagged_file = read_from_path(path).map_err(|_| "write_failed")?;
    let tag_type = tagged_file.primary_tag_type();
    if !tagged_file.tag_support(tag_type).is_writable()
        || ItemKey::ContentGroup.map_key(tag_type).is_none()
    {
        return Err("tag_not_writable");
    }
    if tagged_file.primary_tag().is_none() {
        tagged_file.insert_tag(Tag::new(tag_type));
    }
    tagged_file
        .primary_tag_mut()
        .ok_or("tag_not_writable")?
        .insert_text(ItemKey::ContentGroup, subgenre.to_owned());
    tagged_file
        .save_to_path(path, WriteOptions::default())
        .map_err(|_| "write_failed")?;
    let after = read_audio_metadata(path).map_err(|_| "verification_failed")?;
    if after.subgenre.as_deref() != Some(subgenre)
        || after.genre != before.genre
        || after.title != before.title
        || after.artist != before.artist
        || after.album != before.album
        || after.bpm != before.bpm
        || after.musical_key != before.musical_key
    {
        return Err("verification_failed");
    }
    Ok(after)
}

fn build_metadata_write_preview(
    session: &ScanSession,
    request: &MetadataWriteRequest,
) -> Result<(MetadataWritePreview, Vec<MetadataEditInput>), String> {
    if request.edits.is_empty() || request.edits.len() > MAX_METADATA_WRITE_TRACKS {
        return Err(format!(
            "Selecciona entre 1 y {MAX_METADATA_WRITE_TRACKS} pistas para editar metadatos."
        ));
    }

    let mut unique_ids = HashSet::with_capacity(request.edits.len());
    let mut normalized_edits = Vec::with_capacity(request.edits.len());
    let mut files = Vec::with_capacity(request.edits.len());
    for raw_edit in &request.edits {
        let edit = normalized_metadata_edit(raw_edit)?;
        if !unique_ids.insert(edit.scan_id.clone()) {
            return Err("La edición contiene una pista repetida.".to_owned());
        }
        let session_track = session
            .tracks
            .get(&edit.scan_id)
            .ok_or_else(|| "La edición no pertenece al escaneo activo.".to_owned())?;
        let current_size = fs::metadata(&session_track.absolute_path)
            .map_err(|_| {
                format!(
                    "El archivo {} ya no está disponible. Vuelve a escanear.",
                    session_track.track.relative_path
                )
            })?
            .len();
        if current_size != session_track.track.size_bytes {
            return Err(format!(
                "El archivo {} cambió desde el escaneo. No se editará.",
                session_track.track.relative_path
            ));
        }
        ensure_metadata_writable(&session_track.absolute_path)
            .map_err(|error| format!("{}: {error}", session_track.track.relative_path))?;
        let changes = metadata_file_changes(&session_track.track, &edit);
        if !changes.is_empty() {
            files.push(MetadataFilePreview {
                changes,
                relative_path: session_track.track.relative_path.clone(),
                scan_id: edit.scan_id.clone(),
            });
        }
        normalized_edits.push(edit);
    }
    Ok((MetadataWritePreview { files }, normalized_edits))
}

fn set_optional_tag_text(
    tag: &mut Tag,
    value: &str,
    setter: impl FnOnce(&mut Tag, String),
    remover: impl FnOnce(&mut Tag),
) {
    match cleaned_text(value) {
        Some(value) => setter(tag, value),
        None => remover(tag),
    }
}

fn write_metadata_to_file(path: &Path, edit: &MetadataEditInput) -> Result<AudioMetadata, String> {
    let mut tagged_file = read_from_path(path)
        .map_err(|error| format!("No se pudo leer el contenedor de audio: {error}"))?;
    let tag_type = tagged_file.primary_tag_type();
    if !tagged_file.tag_support(tag_type).is_writable() {
        return Err("El contenedor no admite escritura de su etiqueta principal.".to_owned());
    }
    if tagged_file.primary_tag().is_none() {
        tagged_file.insert_tag(Tag::new(tag_type));
    }
    let tag = tagged_file
        .primary_tag_mut()
        .ok_or_else(|| "No se pudo preparar la etiqueta principal.".to_owned())?;
    set_optional_tag_text(tag, &edit.title, Tag::set_title, Tag::remove_title);
    set_optional_tag_text(tag, &edit.artist, Tag::set_artist, Tag::remove_artist);
    set_optional_tag_text(tag, &edit.album, Tag::set_album, Tag::remove_album);
    set_optional_tag_text(tag, &edit.genre, Tag::set_genre, Tag::remove_genre);
    tag.remove_key(ItemKey::Bpm);
    tag.remove_key(ItemKey::IntegerBpm);
    if let Some(bpm) = edit.bpm {
        tag.insert_text(ItemKey::Bpm, bpm_metadata_text(bpm));
    }
    tag.remove_key(ItemKey::InitialKey);
    if let Some(musical_key) = cleaned_text(&edit.musical_key) {
        tag.insert_text(ItemKey::InitialKey, musical_key);
    }
    tagged_file
        .save_to_path(path, WriteOptions::default())
        .map_err(|error| format!("No se pudo guardar la etiqueta: {error}"))?;

    let written = read_audio_metadata(path)
        .map_err(|error| format!("No se pudo verificar la etiqueta escrita: {error}"))?;
    let expected = metadata_file_changes(
        &ScannedAudioFile {
            scan_id: String::new(),
            name: String::new(),
            relative_path: String::new(),
            extension: String::new(),
            size_bytes: 0,
            metadata_read: true,
            title: written.title.clone(),
            artist: written.artist.clone(),
            album: written.album.clone(),
            genre: written.genre.clone(),
            duration_seconds: written.duration_seconds,
            bpm: written.bpm,
            musical_key: written.musical_key.clone(),
            duplicate_group: None,
        },
        edit,
    );
    if !expected.is_empty() {
        return Err(
            "El formato descartó uno o más campos; se restaurará la copia original.".to_owned(),
        );
    }
    Ok(written)
}

fn restore_metadata_backups(backups: &[MetadataBackup]) -> bool {
    let mut restored_all = true;
    for backup in backups.iter().rev() {
        if fs::copy(&backup.backup_path, &backup.original_path).is_err() {
            restored_all = false;
        }
    }
    restored_all
}

fn restore_metadata_run(session: &mut ScanSession, backups: &[MetadataBackup]) -> bool {
    if !restore_metadata_backups(backups) {
        return false;
    }
    for backup in backups {
        let Ok(metadata) = read_audio_metadata(&backup.original_path) else {
            return false;
        };
        let Ok(file_metadata) = fs::metadata(&backup.original_path) else {
            return false;
        };
        let Ok(updated) = update_session_track_after_write(
            session,
            &backup.scan_id,
            metadata,
            file_metadata.len(),
        ) else {
            return false;
        };
        session
            .file_versions
            .insert(updated.relative_path, file_version(&file_metadata));
    }
    true
}

fn update_session_track_after_write(
    session: &mut ScanSession,
    scan_id: &str,
    metadata: AudioMetadata,
    size_bytes: u64,
) -> Result<ScannedAudioFile, String> {
    let session_track = session
        .tracks
        .get_mut(scan_id)
        .ok_or_else(|| "La pista dejó de pertenecer a la sesión activa.".to_owned())?;
    session_track.track.size_bytes = size_bytes;
    session_track.track.metadata_read = true;
    session_track.track.title = metadata.title;
    session_track.track.artist = metadata.artist;
    session_track.track.album = metadata.album;
    session_track.track.genre = metadata.genre;
    session_track.track.duration_seconds = metadata.duration_seconds;
    session_track.track.bpm = metadata.bpm;
    session_track.track.musical_key = metadata.musical_key;
    Ok(session_track.track.clone())
}

fn apply_metadata_write_batch(
    session: &mut ScanSession,
    request: &MetadataWriteRequest,
) -> Result<(MetadataWriteRun, MetadataWriteResult), String> {
    let (preview, edits) = build_metadata_write_preview(session, request)?;
    if preview.files.is_empty() {
        return Err("No hay cambios de metadatos que aplicar.".to_owned());
    }
    let edits_by_id = edits
        .into_iter()
        .map(|edit| (edit.scan_id.clone(), edit))
        .collect::<HashMap<_, _>>();
    let run_id = operation_id("metadata-write")?;
    let backup_root = session.root.join(METADATA_BACKUP_DIRECTORY).join(&run_id);
    let mut backups = Vec::with_capacity(preview.files.len());
    let mut written_metadata = HashMap::with_capacity(preview.files.len());

    for file in &preview.files {
        let session_track = session
            .tracks
            .get(&file.scan_id)
            .cloned()
            .ok_or_else(|| "La pista dejó de pertenecer al escaneo activo.".to_owned())?;
        let backup_path = backup_root.join(Path::new(&session_track.track.relative_path));
        if let Some(parent) = backup_path.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                restore_metadata_backups(&backups);
                return Err(format!("No se pudo crear la copia de seguridad: {error}"));
            }
        }
        if let Err(error) = fs::copy(&session_track.absolute_path, &backup_path) {
            restore_metadata_backups(&backups);
            return Err(format!(
                "No se pudo copiar el archivo antes de editarlo: {error}"
            ));
        }
        backups.push(MetadataBackup {
            backup_path,
            original_path: session_track.absolute_path.clone(),
            scan_id: file.scan_id.clone(),
            written_fingerprint: [0; 32],
        });
        let edit = edits_by_id
            .get(&file.scan_id)
            .ok_or_else(|| "No se encontró la edición validada.".to_owned())?;
        match write_metadata_to_file(&session_track.absolute_path, edit).and_then(|metadata| {
            let size = fs::metadata(&session_track.absolute_path)
                .map_err(|error| format!("No se pudo verificar el archivo escrito: {error}"))?
                .len();
            let fingerprint = hash_file(&session_track.absolute_path, size)?;
            Ok((metadata, size, fingerprint))
        }) {
            Ok((metadata, size, fingerprint)) => {
                backups
                    .last_mut()
                    .expect("the backup was just inserted")
                    .written_fingerprint = fingerprint;
                written_metadata.insert(file.scan_id.clone(), (metadata, size));
            }
            Err(error) => {
                let restored = restore_metadata_backups(&backups);
                return Err(if restored {
                    format!("No se pudo escribir el lote y se restauraron los originales: {error}")
                } else {
                    format!(
                        "No se pudo escribir el lote ni completar la restauración automática. Conserva la carpeta {METADATA_BACKUP_DIRECTORY}: {error}"
                    )
                });
            }
        }
    }

    let mut updated_tracks = Vec::with_capacity(written_metadata.len());
    for backup in &backups {
        let (metadata, size_bytes) = written_metadata
            .remove(&backup.scan_id)
            .ok_or_else(|| "Falta la verificación de una pista escrita.".to_owned())?;
        let updated =
            update_session_track_after_write(session, &backup.scan_id, metadata, size_bytes)?;
        let written_file = fs::metadata(&backup.original_path)
            .map_err(|error| format!("No se pudo actualizar el snapshot escrito: {error}"))?;
        session
            .file_versions
            .insert(updated.relative_path.clone(), file_version(&written_file));
        updated_tracks.push(updated);
    }
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "No se pudo fechar la escritura de metadatos.".to_owned())?
        .as_secs();
    let run = MetadataWriteRun {
        backups,
        created_at,
        id: run_id.clone(),
        session_id: request.session_id.clone(),
        undone: false,
    };
    let result = MetadataWriteResult {
        applied_files: updated_tracks.len(),
        run_id: Some(run_id),
        updated_tracks,
    };
    Ok((run, result))
}

fn extract_xml_path(tag: &str) -> Option<String> {
    for quote in ['"', '\''] {
        let marker = format!("path={quote}");
        let Some(marker_position) = tag.find(&marker) else {
            continue;
        };
        let start = marker_position + marker.len();
        let Some(relative_end) = tag[start..].find(quote) else {
            continue;
        };
        let end = relative_end + start;
        return Some(
            tag[start..end]
                .replace("&quot;", "\"")
                .replace("&apos;", "'")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&amp;", "&"),
        );
    }
    None
}

fn parse_virtualdj_paths(xml: &str) -> Result<Vec<String>, String> {
    if xml.len() > 10_000_000 || !xml.contains("<VirtualFolder") {
        return Err("El archivo no contiene una List válida de VirtualDJ.".to_owned());
    }
    let mut paths = Vec::new();
    let mut remainder = xml;
    while let Some(start) = remainder.find("<song") {
        remainder = &remainder[start..];
        let Some(end) = remainder.find('>') else {
            break;
        };
        let tag = &remainder[..=end];
        let path = extract_xml_path(tag)
            .ok_or_else(|| "Una pista de VirtualDJ no contiene ruta.".to_owned())?;
        paths.push(path);
        remainder = &remainder[end + 1..];
    }
    Ok(paths)
}

fn selected_session_tracks(
    state: &DesktopState,
    session_id: &str,
    track_ids: &[String],
) -> Result<Vec<SessionTrack>, String> {
    if track_ids.is_empty() || track_ids.len() > MAX_TRACKS {
        return Err("Selecciona entre 1 y 10.000 pistas para exportar.".to_owned());
    }

    let mut unique_ids = HashSet::with_capacity(track_ids.len());
    let current_session = state
        .scan_session
        .lock()
        .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
    let session = current_session
        .as_ref()
        .filter(|session| session.id == session_id)
        .ok_or_else(|| {
            "El escaneo ya no está disponible. Vuelve a seleccionar la carpeta.".to_owned()
        })?;

    track_ids
        .iter()
        .map(|track_id| {
            if !unique_ids.insert(track_id) {
                return Err("La selección contiene una pista repetida.".to_owned());
            }
            session
                .tracks
                .get(track_id)
                .cloned()
                .ok_or_else(|| "La selección no pertenece al escaneo activo.".to_owned())
        })
        .collect()
}

fn parse_library_fingerprint(value: &str) -> Result<[u8; 32], String> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("La biblioteca contiene una huella no válida.".to_owned());
    }

    let mut fingerprint = [0_u8; 32];
    for (index, byte) in fingerprint.iter_mut().enumerate() {
        let offset = index * 2;
        *byte = u8::from_str_radix(&value[offset..offset + 2], 16)
            .map_err(|_| "La biblioteca contiene una huella no válida.".to_owned())?;
    }
    Ok(fingerprint)
}

fn valid_library_track_id(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        })
}

fn valid_local_file_identity(identity: &LocalFileIdentity) -> bool {
    identity.size <= MAX_SAFE_JSON_INTEGER
        && identity.fingerprint.len() == 64
        && identity
            .fingerprint
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
}

fn validate_local_alias_store(store: &LocalLibraryFileAliases) -> bool {
    store.version == LIBRARY_FILE_ALIASES_VERSION
        && store.tracks.len() <= MAX_LIBRARY_FILE_ALIAS_TRACKS
        && store.tracks.iter().all(|(track_id, record)| {
            valid_library_track_id(track_id)
                && valid_local_file_identity(&record.anchor)
                && record.aliases.len() <= MAX_LIBRARY_FILE_ALIASES_PER_TRACK
                && record.aliases.iter().all(valid_local_file_identity)
        })
}

fn read_local_alias_store(path: &Path) -> LocalLibraryFileAliases {
    fs::read(path)
        .ok()
        .filter(|bytes| bytes.len() <= 4_000_000)
        .and_then(|bytes| serde_json::from_slice::<LocalLibraryFileAliases>(&bytes).ok())
        .filter(validate_local_alias_store)
        .unwrap_or_default()
}

#[cfg(not(windows))]
fn replace_local_alias_store(temp: &Path, target: &Path) -> std::io::Result<()> {
    fs::rename(temp, target)
}

#[cfg(windows)]
fn replace_local_alias_store(temp: &Path, target: &Path) -> std::io::Result<()> {
    use std::{iter, os::windows::ffi::OsStrExt};

    #[link(name = "kernel32")]
    extern "system" {
        fn MoveFileExW(existing: *const u16, replacement: *const u16, flags: u32) -> i32;
    }
    const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x8;
    let existing = temp
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect::<Vec<_>>();
    let replacement = target
        .as_os_str()
        .encode_wide()
        .chain(iter::once(0))
        .collect::<Vec<_>>();
    // SAFETY: both pointers reference NUL-terminated UTF-16 buffers that remain
    // alive for the duration of the call.
    let result = unsafe {
        MoveFileExW(
            existing.as_ptr(),
            replacement.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn write_local_alias_store(path: &Path, store: &LocalLibraryFileAliases) -> Result<(), ()> {
    if !validate_local_alias_store(store) {
        return Err(());
    }
    let parent = path.parent().ok_or(())?;
    fs::create_dir_all(parent).map_err(|_| ())?;
    let temp = parent.join(format!(".{LIBRARY_FILE_ALIASES_NAME}.tmp"));
    let bytes = serde_json::to_vec(store).map_err(|_| ())?;
    let mut file = File::create(&temp).map_err(|_| ())?;
    file.write_all(&bytes).map_err(|_| ())?;
    file.sync_all().map_err(|_| ())?;
    drop(file);
    if replace_local_alias_store(&temp, path).is_err() {
        let _ = fs::remove_file(&temp);
        return Err(());
    }
    Ok(())
}

fn fingerprint_text(fingerprint: [u8; 32]) -> String {
    fingerprint
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn update_alias_anchors(
    store: &mut LocalLibraryFileAliases,
    candidates: &[LibraryLinkCandidate],
    linked_track_ids: impl Iterator<Item = String>,
) {
    let by_id = candidates
        .iter()
        .map(|candidate| (candidate.track_id.as_str(), candidate))
        .collect::<HashMap<_, _>>();
    for track_id in linked_track_ids {
        if !valid_library_track_id(&track_id) {
            continue;
        }
        let Some(candidate) = by_id.get(track_id.as_str()) else {
            continue;
        };
        let anchor = LocalFileIdentity {
            fingerprint: candidate.file_fingerprint.to_ascii_lowercase(),
            size: candidate.file_size,
        };
        if !valid_local_file_identity(&anchor) {
            continue;
        }
        let has_capacity = store.tracks.len() < MAX_LIBRARY_FILE_ALIAS_TRACKS;
        match store.tracks.get_mut(&track_id) {
            Some(record) if record.anchor != anchor => {
                *record = LocalTrackAliases {
                    anchor,
                    aliases: Vec::new(),
                };
            }
            Some(_) => {}
            None if has_capacity => {
                store.tracks.insert(
                    track_id,
                    LocalTrackAliases {
                        anchor,
                        aliases: Vec::new(),
                    },
                );
            }
            None => {}
        }
    }
}

fn register_local_alias(
    store: &mut LocalLibraryFileAliases,
    track_id: &str,
    fingerprint: [u8; 32],
    size: u64,
) -> bool {
    let Some(record) = store.tracks.get_mut(track_id) else {
        return false;
    };
    let alias = LocalFileIdentity {
        fingerprint: fingerprint_text(fingerprint),
        size,
    };
    if !valid_local_file_identity(&alias) || alias == record.anchor {
        return false;
    }
    record.aliases.retain(|existing| existing != &alias);
    record.aliases.push(alias);
    if record.aliases.len() > MAX_LIBRARY_FILE_ALIASES_PER_TRACK {
        let excess = record.aliases.len() - MAX_LIBRARY_FILE_ALIASES_PER_TRACK;
        record.aliases.drain(..excess);
    }
    true
}

fn persist_local_aliases(path: &Path, aliases: &[(String, [u8; 32], u64)]) -> Result<(), ()> {
    if aliases.is_empty() {
        return Ok(());
    }
    let mut store = read_local_alias_store(path);
    for (track_id, fingerprint, size) in aliases {
        if !register_local_alias(&mut store, track_id, *fingerprint, *size) {
            let already_known = store.tracks.get(track_id).is_some_and(|record| {
                let identity = LocalFileIdentity {
                    fingerprint: fingerprint_text(*fingerprint),
                    size: *size,
                };
                record.anchor == identity || record.aliases.contains(&identity)
            });
            if !already_known {
                return Err(());
            }
        }
    }
    write_local_alias_store(path, &store)
}

fn linked_aliases_for_backups(
    session: &ScanSession,
    backups: &[MetadataBackup],
) -> Result<Vec<(String, [u8; 32], u64)>, ()> {
    let track_by_scan = session
        .library_links
        .iter()
        .map(|(track_id, scan_id)| (scan_id.as_str(), track_id.as_str()))
        .collect::<HashMap<_, _>>();
    backups
        .iter()
        .filter_map(|backup| {
            track_by_scan
                .get(backup.scan_id.as_str())
                .map(|track_id| (backup, *track_id))
        })
        .map(|(backup, track_id)| {
            let size = fs::metadata(&backup.original_path).map_err(|_| ())?.len();
            Ok((track_id.to_owned(), backup.written_fingerprint, size))
        })
        .collect()
}

fn aliases_for_candidates(
    store: &LocalLibraryFileAliases,
    candidates: &[LibraryLinkCandidate],
) -> HashMap<(u64, [u8; 32]), String> {
    let mut aliases: HashMap<(u64, [u8; 32]), Option<String>> = HashMap::new();
    for candidate in candidates {
        let Some(record) = store.tracks.get(&candidate.track_id) else {
            continue;
        };
        let anchor_matches = record.anchor.size == candidate.file_size
            && record
                .anchor
                .fingerprint
                .eq_ignore_ascii_case(&candidate.file_fingerprint);
        if !anchor_matches {
            continue;
        }
        for alias in &record.aliases {
            let Ok(fingerprint) = parse_library_fingerprint(&alias.fingerprint) else {
                continue;
            };
            aliases
                .entry((alias.size, fingerprint))
                .and_modify(|owner| *owner = None)
                .or_insert_with(|| Some(candidate.track_id.clone()));
        }
    }
    aliases
        .into_iter()
        .filter_map(|(identity, owner)| owner.map(|track_id| (identity, track_id)))
        .collect()
}

#[cfg(test)]
fn link_library_candidates(
    session_tracks: &[SessionTrack],
    candidates: &[LibraryLinkCandidate],
) -> Result<LibraryLinkMatch, String> {
    link_library_candidates_with_aliases(
        session_tracks,
        candidates,
        &LocalLibraryFileAliases::default(),
    )
}

fn link_library_candidates_with_aliases(
    session_tracks: &[SessionTrack],
    candidates: &[LibraryLinkCandidate],
    alias_store: &LocalLibraryFileAliases,
) -> Result<LibraryLinkMatch, String> {
    if candidates.len() > MAX_TRACKS {
        return Err("La vinculación admite hasta 10.000 pistas por sesión.".to_owned());
    }

    let mut unique_track_ids = HashSet::with_capacity(candidates.len());
    let mut candidates_by_size: HashMap<u64, HashMap<[u8; 32], Vec<String>>> = HashMap::new();
    for candidate in candidates {
        if candidate.track_id.is_empty()
            || candidate.track_id.len() > 128
            || !unique_track_ids.insert(candidate.track_id.clone())
        {
            return Err(
                "La selección de biblioteca contiene identificadores no válidos.".to_owned(),
            );
        }
        let fingerprint = parse_library_fingerprint(&candidate.file_fingerprint)?;
        candidates_by_size
            .entry(candidate.file_size)
            .or_default()
            .entry(fingerprint)
            .or_default()
            .push(candidate.track_id.clone());
    }

    let mut ordered_tracks = session_tracks.iter().collect::<Vec<_>>();
    ordered_tracks.sort_by_key(|track| track.track.relative_path.to_ascii_lowercase());
    let mut links = HashMap::new();
    let aliases = aliases_for_candidates(alias_store, candidates);
    let mut alias_linked_scan_ids = HashSet::new();
    let mut fingerprint_failures = 0;

    for session_track in ordered_tracks {
        let fingerprints = candidates_by_size.get(&session_track.track.size_bytes);
        if fingerprints.is_none()
            && !aliases
                .keys()
                .any(|(size, _)| *size == session_track.track.size_bytes)
        {
            continue;
        }
        let fingerprint =
            match hash_file(&session_track.absolute_path, session_track.track.size_bytes) {
                Ok(fingerprint) => fingerprint,
                Err(_) => {
                    fingerprint_failures += 1;
                    continue;
                }
            };
        if let Some(track_ids) = fingerprints.and_then(|values| values.get(&fingerprint)) {
            for track_id in track_ids {
                links
                    .entry(track_id.clone())
                    .or_insert_with(|| session_track.track.scan_id.clone());
            }
            continue;
        }
        if let Some(track_id) = aliases.get(&(session_track.track.size_bytes, fingerprint)) {
            if !links.contains_key(track_id)
                && alias_linked_scan_ids.insert(session_track.track.scan_id.clone())
            {
                links.insert(track_id.clone(), session_track.track.scan_id.clone());
            }
        }
    }

    Ok(LibraryLinkMatch {
        fingerprint_failures,
        unmatched_tracks: candidates.len().saturating_sub(links.len()),
        links,
    })
}

fn validate_virtualdj_list_name(list_name: &str) -> Result<&str, String> {
    let list_name = list_name.trim();
    if list_name.is_empty() || list_name.chars().count() > 120 {
        Err("El nombre de la lista debe tener entre 1 y 120 caracteres.".to_owned())
    } else {
        Ok(list_name)
    }
}

fn analysis_error(code: &str, stage: Option<&str>, message: &str) -> AnalyzeScannedTrackError {
    AnalyzeScannedTrackError {
        code: code.to_owned(),
        stage: stage.map(str::to_owned),
        message: message.to_owned(),
    }
}

fn resolve_analysis_track(
    state: &DesktopState,
    request: &AnalyzeScannedTrackRequest,
) -> Result<ConfirmedAnalysisTrack, AnalyzeScannedTrackError> {
    if request.session_id.is_empty() || request.scan_id.is_empty() {
        return Err(analysis_error(
            "invalid_request",
            None,
            "La solicitud de análisis no es válida.",
        ));
    }
    let current = state.scan_session.lock().map_err(|_| {
        analysis_error(
            "scan_session_unavailable",
            None,
            "La sesión de escaneo no está disponible.",
        )
    })?;
    let session = current
        .as_ref()
        .filter(|session| session.id == request.session_id)
        .ok_or_else(|| {
            analysis_error(
                "scan_session_unavailable",
                None,
                "La sesión de escaneo no está disponible.",
            )
        })?;
    let track = session.tracks.get(&request.scan_id).ok_or_else(|| {
        analysis_error(
            "track_not_in_session",
            None,
            "La pista no pertenece a la sesión de escaneo.",
        )
    })?;
    let expected_version = session
        .file_versions
        .get(&track.track.relative_path)
        .ok_or_else(|| {
            analysis_error(
                "track_unavailable",
                None,
                "La pista confirmada no está disponible.",
            )
        })?;
    Ok(ConfirmedAnalysisTrack {
        scan_id: request.scan_id.clone(),
        root: session.root.clone(),
        absolute_path: track.absolute_path.clone(),
        relative_path: PathBuf::from(&track.track.relative_path),
        expected_size: track.track.size_bytes,
        expected_version: expected_version.clone(),
        duration_seconds: track.track.duration_seconds,
    })
}

fn validate_analysis_track(track: &ConfirmedAnalysisTrack) -> Result<(), AnalyzeScannedTrackError> {
    if !track.absolute_path.is_absolute() || !track.root.is_absolute() {
        return Err(analysis_error(
            "track_unavailable",
            None,
            "La ubicación confirmada de la pista no es válida.",
        ));
    }
    let relative = track.absolute_path.strip_prefix(&track.root).map_err(|_| {
        analysis_error(
            "track_unavailable",
            None,
            "La pista ya no está dentro de la carpeta confirmada.",
        )
    })?;
    if relative != track.relative_path {
        return Err(analysis_error(
            "track_unavailable",
            None,
            "La identidad local de la pista no coincide.",
        ));
    }
    let canonical_root = fs::canonicalize(&track.root).map_err(|_| {
        analysis_error(
            "track_unavailable",
            None,
            "La carpeta confirmada no está disponible.",
        )
    })?;
    if !fs::metadata(&canonical_root)
        .map(|metadata| metadata.is_dir())
        .unwrap_or(false)
    {
        return Err(analysis_error(
            "track_unavailable",
            None,
            "La carpeta confirmada no es válida.",
        ));
    }
    let metadata = fs::symlink_metadata(&track.absolute_path).map_err(|_| {
        analysis_error(
            "track_unavailable",
            None,
            "La pista confirmada no está disponible.",
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        return Err(analysis_error(
            "track_unavailable",
            None,
            "La pista confirmada no es un archivo regular.",
        ));
    }
    let canonical_path = fs::canonicalize(&track.absolute_path).map_err(|_| {
        analysis_error(
            "track_unavailable",
            None,
            "La pista confirmada no está disponible.",
        )
    })?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err(analysis_error(
            "track_unavailable",
            None,
            "La pista ya no está dentro de la carpeta confirmada.",
        ));
    }
    let actual = file_version(&metadata);
    if track.expected_version.modified_nanos.is_none()
        || actual.modified_nanos.is_none()
        || metadata.len() != track.expected_size
        || actual != track.expected_version
    {
        return Err(analysis_error(
            "track_changed",
            None,
            "La pista cambió desde el escaneo.",
        ));
    }
    Ok(())
}

fn validated_analysis_descriptor_identity(
    file: &File,
    track: &ConfirmedAnalysisTrack,
) -> Result<AnalysisFileIdentity, AnalyzeScannedTrackError> {
    let metadata = file.metadata().map_err(|_| {
        analysis_error(
            "track_changed",
            None,
            "La pista cambió durante el análisis.",
        )
    })?;
    let actual_version = file_version(&metadata);
    if !metadata.is_file()
        || metadata.len() != track.expected_size
        || actual_version.modified_nanos.is_none()
        || actual_version != track.expected_version
    {
        return Err(analysis_error(
            "track_changed",
            None,
            "La pista cambió durante el análisis.",
        ));
    }
    analysis_file_identity(file).ok_or_else(|| {
        analysis_error(
            "track_unavailable",
            None,
            "No se pudo confirmar la identidad de la pista.",
        )
    })
}

fn open_current_analysis_path(
    track: &ConfirmedAnalysisTrack,
) -> Result<(File, AnalysisFileIdentity), AnalyzeScannedTrackError> {
    validate_analysis_track(track)?;
    let file = File::open(&track.absolute_path).map_err(|_| {
        analysis_error(
            "track_unavailable",
            None,
            "La pista confirmada no se pudo abrir.",
        )
    })?;
    let identity = validated_analysis_descriptor_identity(&file, track)?;
    Ok((file, identity))
}

fn analyze_confirmed_track_with_open<O, E>(
    state: &DesktopState,
    request: AnalyzeScannedTrackRequest,
    open: O,
    execute: E,
) -> Result<AnalyzeScannedTrackResult, AnalyzeScannedTrackError>
where
    O: FnOnce(&Path) -> std::io::Result<File>,
    E: FnOnce(
        File,
        Option<f64>,
        &str,
    ) -> Result<maest::MaestAnalysisResult, AnalyzeScannedTrackError>,
{
    let track = resolve_analysis_track(state, &request)?;
    let (validated_file, validated_identity) = open_current_analysis_path(&track)?;
    let file = open(&track.absolute_path).map_err(|_| {
        analysis_error(
            "track_unavailable",
            None,
            "La pista confirmada no se pudo abrir.",
        )
    })?;
    let analysis_identity = validated_analysis_descriptor_identity(&file, &track)?;
    if analysis_identity != validated_identity {
        return Err(analysis_error(
            "track_changed",
            None,
            "La pista cambió antes del análisis.",
        ));
    }
    drop(validated_file);
    let (current_path, current_path_identity) = open_current_analysis_path(&track)?;
    if current_path_identity != analysis_identity {
        return Err(analysis_error(
            "track_changed",
            None,
            "La pista cambió antes del análisis.",
        ));
    }
    drop(current_path);
    let analysis_file = file.try_clone().map_err(|_| {
        analysis_error(
            "track_unavailable",
            None,
            "La pista confirmada no se pudo abrir.",
        )
    })?;
    let analyzed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| {
            analysis_error(
                "analysis_task_failed",
                None,
                "No se pudo fechar el análisis.",
            )
        })?
        .as_millis()
        .to_string();
    let analysis = execute(analysis_file, track.duration_seconds, &analyzed_at)?;
    let final_descriptor_identity = validated_analysis_descriptor_identity(&file, &track)?;
    let (final_path, final_path_identity) = open_current_analysis_path(&track)?;
    drop(final_path);
    if final_descriptor_identity != analysis_identity || final_path_identity != analysis_identity {
        return Err(analysis_error(
            "track_changed",
            None,
            "La pista cambió durante el análisis.",
        ));
    }
    Ok(AnalyzeScannedTrackResult {
        scan_id: track.scan_id,
        analysis,
    })
}

fn analyze_confirmed_track_with<E>(
    state: &DesktopState,
    request: AnalyzeScannedTrackRequest,
    execute: E,
) -> Result<AnalyzeScannedTrackResult, AnalyzeScannedTrackError>
where
    E: FnOnce(
        File,
        Option<f64>,
        &str,
    ) -> Result<maest::MaestAnalysisResult, AnalyzeScannedTrackError>,
{
    analyze_confirmed_track_with_open(state, request, |path| File::open(path), execute)
}

fn map_analysis_task_result<T, E>(result: Result<T, E>) -> Result<T, AnalyzeScannedTrackError> {
    result.map_err(|_| {
        analysis_error(
            "analysis_task_failed",
            None,
            "La tarea de análisis se interrumpió.",
        )
    })
}

fn activate_completed_scan(
    state: &DesktopState,
    root: PathBuf,
    session_id: String,
    completed: CompletedScan,
) -> Result<FolderScanResult, String> {
    let tracks = completed
        .session_tracks
        .into_iter()
        .map(|track| (track.track.scan_id.clone(), track))
        .collect();
    let truncated = completed.result.truncated;
    let mut current_session = state
        .scan_session
        .lock()
        .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
    *current_session = Some(ScanSession {
        file_versions: completed.file_versions,
        id: session_id,
        incremental_scan_active: false,
        root,
        tracks,
        truncated,
        library_links: HashMap::new(),
    });
    drop(current_session);
    state
        .pending_maest_genre_previews
        .lock()
        .map_err(|_| "No se pudo invalidar la previsualización anterior.".to_owned())?
        .clear();
    Ok(completed.result)
}

#[tauri::command]
fn begin_maest_analysis(
    state: State<'_, DesktopState>,
    request: AnalyzeScannedTrackRequest,
) -> Result<(), AnalyzeScannedTrackError> {
    begin_maest_operation(&state, &request)
}

#[tauri::command]
async fn analyze_scanned_track(
    app: AppHandle,
    request: AnalyzeScannedTrackRequest,
) -> Result<AnalyzeScannedTrackResult, AnalyzeScannedTrackError> {
    let task = tauri::async_runtime::spawn_blocking(move || {
        let desktop = app.state::<DesktopState>();
        let operation = start_maest_operation(&desktop, &request)?;
        ensure_maest_operation_active(&operation)?;
        let result = analyze_confirmed_track_with(
            &desktop,
            request,
            |file, duration_seconds, analyzed_at| {
                let maest = app.state::<maest::MaestState>();
                maest
                    .with_ready_session(|session, gate| {
                        maest_inference_pipeline::analyze_media_sources_cancellable(
                            session,
                            gate,
                            duration_seconds,
                            || {
                                let mut clone = file.try_clone().map_err(|_| {
                                    maest_pipeline::MaestPipelineError {
                                        stage: "decode",
                                        code: "invalid_source".into(),
                                    }
                                })?;
                                clone
                                    .rewind()
                                    .map_err(|_| maest_pipeline::MaestPipelineError {
                                        stage: "decode",
                                        code: "invalid_source".into(),
                                    })?;
                                Ok(Box::new(clone) as Box<dyn symphonia::core::io::MediaSource>)
                            },
                            analyzed_at,
                            &operation.cancel,
                            &operation.progress,
                        )
                    })
                    .ok_or_else(|| {
                        analysis_error(
                            "model_not_ready",
                            None,
                            "El analizador todavía no está preparado.",
                        )
                    })?
                    .map_err(|error| {
                        analysis_error(
                            &error.code,
                            Some(error.stage),
                            "No se pudo completar el análisis de audio.",
                        )
                    })
            },
        );
        if operation.cancel.load(Ordering::Acquire) {
            Err(analysis_error(
                "analysis_cancelled",
                Some("cancel"),
                "El análisis fue cancelado.",
            ))
        } else {
            result
        }
    })
    .await;
    map_analysis_task_result(task)?
}

#[tauri::command]
fn get_maest_analysis_progress(
    state: State<'_, DesktopState>,
    request: CancelMaestAnalysisRequest,
) -> Option<maest_inference_pipeline::MaestAnalysisProgress> {
    maest_analysis_progress(&state, &request)
}

#[tauri::command]
fn cancel_maest_analysis(
    state: State<'_, DesktopState>,
    request: CancelMaestAnalysisRequest,
) -> Result<(), String> {
    request_maest_cancellation(&state, &request);
    Ok(())
}

#[tauri::command]
fn release_maest_analysis(
    state: State<'_, DesktopState>,
    request: CancelMaestAnalysisRequest,
) -> Result<(), String> {
    release_maest_operation(&state, &request);
    Ok(())
}

#[tauri::command]
async fn choose_and_scan_music_folder(
    app: AppHandle,
    state: State<'_, DesktopState>,
) -> Result<Option<FolderScanResult>, String> {
    let selection = app
        .dialog()
        .file()
        .set_title("Selecciona tu carpeta de música")
        .blocking_pick_folder();

    let Some(selection) = selection else {
        return Ok(None);
    };
    let root = selection
        .into_path()
        .map_err(|error| format!("La carpeta seleccionada no es una ruta local válida: {error}"))?;
    let session_root = root.clone();
    let session_id = create_scan_session_id(&root)?;
    let scan_session_id = session_id.clone();

    let completed =
        tauri::async_runtime::spawn_blocking(move || scan_music_folder(&root, scan_session_id))
            .await
            .map_err(|error| format!("El escaneo local se interrumpió: {error}"))??;

    Ok(Some(activate_completed_scan(
        &state,
        session_root,
        session_id,
        completed,
    )?))
}

#[tauri::command(rename_all = "camelCase")]
async fn scan_music_folder_incrementally(
    state: State<'_, DesktopState>,
    session_id: String,
) -> Result<IncrementalScanResult, String> {
    let (root, previous_tracks, previous_versions) = {
        let mut current_session = state
            .scan_session
            .lock()
            .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
        let session = current_session
            .as_mut()
            .filter(|session| session.id == session_id)
            .ok_or_else(|| {
                "El escaneo ya no está disponible. Vuelve a seleccionar la carpeta.".to_owned()
            })?;
        if session.truncated {
            return Err(
                "La vigilancia no está disponible para un resultado truncado. Reduce el tamaño de la carpeta y vuelve a seleccionarla."
                    .to_owned(),
            );
        }
        if session.incremental_scan_active {
            return Err("Ya hay un escaneo incremental en curso.".to_owned());
        }
        session.incremental_scan_active = true;
        (
            session.root.clone(),
            session.tracks.clone(),
            session.file_versions.clone(),
        )
    };
    let scan_id = session_id.clone();
    let previous_scan_ids = previous_tracks
        .values()
        .map(|track| {
            (
                track.track.relative_path.clone(),
                track.track.scan_id.clone(),
            )
        })
        .collect::<HashMap<_, _>>();
    let scan_attempt = tauri::async_runtime::spawn_blocking(move || {
        scan_music_folder_with_previous(
            &root,
            scan_id,
            Some(&previous_tracks),
            Some(&previous_versions),
        )
        .map(|completed| (completed, previous_versions))
    })
    .await
    .map_err(|error| format!("El escaneo incremental se interrumpió: {error}"))
    .and_then(|result| result);
    {
        let mut current_session = state
            .scan_session
            .lock()
            .map_err(|_| "No se pudo liberar el escaneo incremental.".to_owned())?;
        if let Some(session) = current_session
            .as_mut()
            .filter(|session| session.id == session_id)
        {
            session.incremental_scan_active = false;
        }
    }
    let (completed, previous_versions) = scan_attempt?;
    if completed.result.truncated {
        return Err(
            "El nuevo resultado alcanzó el límite de seguridad y no se aplicó. Reduce el tamaño de la carpeta o inicia un escaneo completo."
                .to_owned(),
        );
    }
    let (added_tracks, removed_tracks, updated_tracks, unchanged_tracks) =
        count_incremental_changes(&previous_versions, &completed.file_versions);
    let current_scan_ids = completed
        .session_tracks
        .iter()
        .map(|track| {
            (
                track.track.relative_path.clone(),
                track.track.scan_id.clone(),
            )
        })
        .collect::<HashMap<_, _>>();
    let added_scan_ids = current_scan_ids
        .iter()
        .filter(|(path, _)| !previous_versions.contains_key(*path))
        .map(|(_, scan_id)| scan_id.clone())
        .collect();
    let removed_scan_ids = previous_scan_ids
        .iter()
        .filter(|(path, _)| !completed.file_versions.contains_key(*path))
        .map(|(_, scan_id)| scan_id.clone())
        .collect();
    let updated_scan_ids = current_scan_ids
        .iter()
        .filter(|(path, _)| {
            completed
                .file_versions
                .get(*path)
                .zip(previous_versions.get(*path))
                .is_some_and(|(current, previous)| current != previous)
        })
        .map(|(_, scan_id)| scan_id.clone())
        .collect();
    let tracks = completed
        .session_tracks
        .iter()
        .cloned()
        .map(|track| (track.track.scan_id.clone(), track))
        .collect::<HashMap<_, _>>();
    let active_scan_ids = tracks.keys().cloned().collect::<HashSet<_>>();
    let mut current_session = state
        .scan_session
        .lock()
        .map_err(|_| "No se pudo actualizar la sesión del escaneo.".to_owned())?;
    let session = current_session
        .as_mut()
        .filter(|session| session.id == session_id)
        .ok_or_else(|| "La sesión cambió durante la vigilancia. Vuelve a escanear.".to_owned())?;
    session
        .library_links
        .retain(|_, scan_id| active_scan_ids.contains(scan_id));
    session.file_versions = completed.file_versions;
    session.tracks = tracks;
    session.truncated = false;
    drop(current_session);
    state
        .pending_maest_genre_previews
        .lock()
        .map_err(|_| "No se pudo invalidar la previsualización anterior.".to_owned())?
        .clear();

    Ok(IncrementalScanResult {
        added_scan_ids,
        added_tracks,
        removed_scan_ids,
        removed_tracks,
        scan: completed.result,
        unchanged_tracks,
        updated_scan_ids,
        updated_tracks,
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn link_library_tracks(
    app: AppHandle,
    state: State<'_, DesktopState>,
    session_id: String,
    candidates: Vec<LibraryLinkCandidate>,
) -> Result<LibraryLinkResult, String> {
    let alias_path = app
        .path()
        .app_data_dir()
        .map_err(|_| "No se pudo abrir el estado local de vínculos.".to_owned())?
        .join(LIBRARY_FILE_ALIASES_NAME);
    let mut alias_store = read_local_alias_store(&alias_path);
    let session_tracks = {
        let current_session = state
            .scan_session
            .lock()
            .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
        let session = current_session
            .as_ref()
            .filter(|session| session.id == session_id)
            .ok_or_else(|| {
                "El escaneo ya no está disponible. Vuelve a seleccionar la carpeta.".to_owned()
            })?;
        session.tracks.values().cloned().collect::<Vec<_>>()
    };

    let link_candidates = candidates.clone();
    let aliases_for_linking = alias_store.clone();
    let matches = tauri::async_runtime::spawn_blocking(move || {
        link_library_candidates_with_aliases(
            &session_tracks,
            &link_candidates,
            &aliases_for_linking,
        )
    })
    .await
    .map_err(|error| format!("La vinculación local se interrumpió: {error}"))??;

    let mut links = matches
        .links
        .iter()
        .map(|(track_id, scan_id)| LibraryTrackLink {
            scan_id: scan_id.clone(),
            track_id: track_id.clone(),
        })
        .collect::<Vec<_>>();
    links.sort_by(|left, right| left.track_id.cmp(&right.track_id));
    let linked_tracks = links.len();
    update_alias_anchors(&mut alias_store, &candidates, matches.links.keys().cloned());
    write_local_alias_store(&alias_path, &alias_store)
        .map_err(|_| "No se pudo guardar el estado local de vínculos.".to_owned())?;
    let mut current_session = state
        .scan_session
        .lock()
        .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
    let session = current_session
        .as_mut()
        .filter(|session| session.id == session_id)
        .ok_or_else(|| {
            "El escaneo cambió durante la vinculación. Vuelve a seleccionar la carpeta.".to_owned()
        })?;
    session.library_links = matches.links;
    drop(current_session);
    state
        .pending_maest_genre_previews
        .lock()
        .map_err(|_| "No se pudo invalidar la previsualización anterior.".to_owned())?
        .clear();

    Ok(LibraryLinkResult {
        fingerprint_failures: matches.fingerprint_failures,
        linked_tracks,
        links,
        unmatched_tracks: matches.unmatched_tracks,
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn preview_metadata_writes(
    state: State<'_, DesktopState>,
    request: MetadataWriteRequest,
) -> Result<MetadataWritePreview, String> {
    let current_session = state
        .scan_session
        .lock()
        .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
    let session = current_session
        .as_ref()
        .filter(|session| session.id == request.session_id)
        .ok_or_else(|| {
            "El escaneo ya no está disponible. Vuelve a seleccionar la carpeta.".to_owned()
        })?;
    build_metadata_write_preview(session, &request).map(|(preview, _)| preview)
}

fn maest_genre_preview_key(
    request: &MaestGenreWriteRequest,
    genre: String,
) -> MaestGenrePreviewKey {
    MaestGenrePreviewKey {
        session_id: request.session_id.clone(),
        scan_id: request.scan_id.clone(),
        field: "genre",
        genre,
    }
}

fn maest_subgenre_preview_key(
    request: &MaestSubgenreWriteRequest,
    subgenre: String,
) -> MaestGenrePreviewKey {
    MaestGenrePreviewKey {
        session_id: request.session_id.clone(),
        scan_id: request.scan_id.clone(),
        field: "subgenre",
        genre: subgenre,
    }
}

fn store_maest_genre_preview(
    state: &DesktopState,
    key: MaestGenrePreviewKey,
    receipt: Option<MaestGenrePreviewReceipt>,
) -> Result<(), SafeMetadataWriteError> {
    let mut pending = state.pending_maest_genre_previews.lock().map_err(|_| {
        SafeMetadataWriteError::new(
            "preview_failed",
            "No se pudo registrar la previsualización.",
        )
    })?;
    pending.retain(|existing, _| {
        existing.session_id != key.session_id || existing.scan_id != key.scan_id
    });
    if let Some(receipt) = receipt {
        if pending.len() >= MAX_PENDING_MAEST_GENRE_PREVIEWS {
            if let Some(oldest) = pending.keys().next().cloned() {
                pending.remove(&oldest);
            }
        }
        pending.insert(key, receipt);
    }
    Ok(())
}

fn preview_maest_genre_write_state(
    state: &DesktopState,
    request: &MaestGenreWriteRequest,
) -> Result<MaestGenreWritePreview, SafeMetadataWriteError> {
    let current_session = state.scan_session.lock().map_err(|_| {
        SafeMetadataWriteError::new("scan_session_unavailable", "El escaneo no está disponible.")
    })?;
    let session = current_session
        .as_ref()
        .filter(|session| session.id == request.session_id)
        .ok_or_else(|| {
            SafeMetadataWriteError::new(
                "scan_session_unavailable",
                "El escaneo no está disponible.",
            )
        })?;
    let (preview, _, receipt) = confirmed_maest_genre_preview(session, request)?;
    let key = maest_genre_preview_key(request, preview.after.clone());
    store_maest_genre_preview(state, key, preview.changed.then_some(receipt))?;
    Ok(preview)
}

fn preview_maest_subgenre_write_state(
    state: &DesktopState,
    request: &MaestSubgenreWriteRequest,
) -> Result<MaestGenreWritePreview, SafeMetadataWriteError> {
    let current_session = state.scan_session.lock().map_err(|_| {
        SafeMetadataWriteError::new("scan_session_unavailable", "El escaneo no está disponible.")
    })?;
    let session = current_session
        .as_ref()
        .filter(|session| session.id == request.session_id)
        .ok_or_else(|| {
            SafeMetadataWriteError::new(
                "scan_session_unavailable",
                "El escaneo no está disponible.",
            )
        })?;
    let (preview, _, receipt) = confirmed_maest_subgenre_preview(session, request)?;
    let key = maest_subgenre_preview_key(request, preview.after.clone());
    store_maest_genre_preview(state, key, preview.changed.then_some(receipt))?;
    Ok(preview)
}

fn restore_maest_genre_backup(
    session: &mut ScanSession,
    track: &SessionTrack,
    backup_path: &Path,
) -> bool {
    if fs::copy(backup_path, &track.absolute_path).is_err() {
        return false;
    }
    let Ok(metadata) = read_audio_metadata(&track.absolute_path) else {
        return true;
    };
    let Ok(file_metadata) = fs::metadata(&track.absolute_path) else {
        return true;
    };
    if let Ok(updated) = update_session_track_after_write(
        session,
        &track.track.scan_id,
        metadata,
        file_metadata.len(),
    ) {
        session
            .file_versions
            .insert(updated.relative_path, file_version(&file_metadata));
    }
    true
}

fn restored_write_error(
    restored: bool,
    code: &'static str,
    message: &'static str,
) -> SafeMetadataWriteError {
    if restored {
        SafeMetadataWriteError::new(code, message)
    } else {
        SafeMetadataWriteError::new(
            "restore_failed",
            "No se pudo restaurar automáticamente el archivo original.",
        )
    }
}

fn apply_maest_genre_write_state_with<W, P>(
    state: &DesktopState,
    request: MaestGenreWriteRequest,
    alias_path: &Path,
    field: &'static str,
    writer: W,
    persist_aliases: P,
) -> Result<MaestGenreWriteResult, SafeMetadataWriteError>
where
    W: FnOnce(&Path, &str) -> Result<AudioMetadata, &'static str>,
    P: FnOnce(&Path, &[(String, [u8; 32], u64)]) -> Result<(), ()>,
{
    let normalized_genre = normalized_metadata_text(&request.genre, "El género", 120)
        .map_err(|_| SafeMetadataWriteError::new("invalid_genre", "El género no es válido."))?
        .ok_or_else(|| SafeMetadataWriteError::new("invalid_genre", "El género no es válido."))?;
    let key = MaestGenrePreviewKey {
        session_id: request.session_id.clone(),
        scan_id: request.scan_id.clone(),
        field,
        genre: normalized_genre,
    };
    let mut current_session = state.scan_session.lock().map_err(|_| {
        SafeMetadataWriteError::new("scan_session_unavailable", "El escaneo no está disponible.")
    })?;
    let session = current_session
        .as_mut()
        .filter(|session| session.id == request.session_id)
        .ok_or_else(|| {
            SafeMetadataWriteError::new(
                "scan_session_unavailable",
                "El escaneo no está disponible.",
            )
        })?;
    let expected_receipt = state
        .pending_maest_genre_previews
        .lock()
        .map_err(|_| {
            SafeMetadataWriteError::new("preview_required", "Previsualiza de nuevo la escritura.")
        })?
        .remove(&key)
        .ok_or_else(|| {
            SafeMetadataWriteError::new("preview_required", "Previsualiza antes de confirmar.")
        })?;
    let (preview, track, current_receipt) =
        confirmed_maest_field_preview(session, &request, field)?;
    if !preview.changed || current_receipt != expected_receipt {
        return Err(SafeMetadataWriteError::new(
            "track_changed",
            "El archivo cambió desde la previsualización.",
        ));
    }

    let mut history = state.metadata_write_history.lock().map_err(|_| {
        SafeMetadataWriteError::new("write_failed", "No se pudo registrar la escritura.")
    })?;
    let run_id = operation_id("metadata-write").map_err(|_| {
        SafeMetadataWriteError::new("backup_failed", "No se pudo preparar la copia.")
    })?;
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| {
            SafeMetadataWriteError::new("write_failed", "No se pudo registrar la escritura.")
        })?
        .as_secs();
    let backup_path = session
        .root
        .join(METADATA_BACKUP_DIRECTORY)
        .join(&run_id)
        .join(Path::new(&track.track.relative_path));
    if let Some(parent) = backup_path.parent() {
        fs::create_dir_all(parent).map_err(|_| {
            SafeMetadataWriteError::new("backup_failed", "No se pudo crear la copia.")
        })?;
    }
    fs::copy(&track.absolute_path, &backup_path)
        .map_err(|_| SafeMetadataWriteError::new("backup_failed", "No se pudo crear la copia."))?;

    let written = match writer(&track.absolute_path, &preview.after) {
        Ok(metadata) => metadata,
        Err(code) => {
            let restored = restore_maest_genre_backup(session, &track, &backup_path);
            return Err(restored_write_error(
                restored,
                code,
                "No se pudo escribir y verificar el género; se restauró el original.",
            ));
        }
    };
    let written_file = match fs::metadata(&track.absolute_path) {
        Ok(metadata) => metadata,
        Err(_) => {
            let restored = restore_maest_genre_backup(session, &track, &backup_path);
            return Err(restored_write_error(
                restored,
                "verification_failed",
                "No se pudo verificar la escritura; se restauró el original.",
            ));
        }
    };
    let written_size = written_file.len();
    let written_fingerprint = match hash_file(&track.absolute_path, written_size) {
        Ok(fingerprint) => fingerprint,
        Err(_) => {
            let restored = restore_maest_genre_backup(session, &track, &backup_path);
            return Err(restored_write_error(
                restored,
                "verification_failed",
                "No se pudo verificar la escritura; se restauró el original.",
            ));
        }
    };
    let updated =
        match update_session_track_after_write(session, &request.scan_id, written, written_size) {
            Ok(updated) => updated,
            Err(_) => {
                let restored = restore_maest_genre_backup(session, &track, &backup_path);
                return Err(restored_write_error(
                    restored,
                    "verification_failed",
                    "No se pudo actualizar la sesión; se restauró el original.",
                ));
            }
        };
    session
        .file_versions
        .insert(updated.relative_path, file_version(&written_file));
    let aliases = linked_aliases_for_backups(
        session,
        &[MetadataBackup {
            backup_path: backup_path.clone(),
            original_path: track.absolute_path.clone(),
            scan_id: request.scan_id.clone(),
            written_fingerprint,
        }],
    )
    .map_err(|_| {
        let restored = restore_maest_genre_backup(session, &track, &backup_path);
        restored_write_error(
            restored,
            "link_state_failed",
            "No se pudo guardar el vínculo local; se restauró el original.",
        )
    })?;
    if persist_aliases(alias_path, &aliases).is_err() {
        let restored = restore_maest_genre_backup(session, &track, &backup_path);
        return Err(restored_write_error(
            restored,
            "link_state_failed",
            "No se pudo guardar el vínculo local; se restauró el original.",
        ));
    }
    history.push(MetadataWriteRun {
        backups: vec![MetadataBackup {
            backup_path,
            original_path: track.absolute_path,
            scan_id: request.scan_id,
            written_fingerprint,
        }],
        created_at,
        id: run_id.clone(),
        session_id: request.session_id,
        undone: false,
    });
    Ok(MaestGenreWriteResult {
        applied_files: 1,
        run_id: Some(run_id),
    })
}

fn apply_maest_genre_write_state(
    state: &DesktopState,
    request: MaestGenreWriteRequest,
    alias_path: &Path,
) -> Result<MaestGenreWriteResult, SafeMetadataWriteError> {
    apply_maest_genre_write_state_with(
        state,
        request,
        alias_path,
        "genre",
        write_genre_only,
        persist_local_aliases,
    )
}

fn apply_maest_subgenre_write_state(
    state: &DesktopState,
    request: MaestSubgenreWriteRequest,
    alias_path: &Path,
) -> Result<MaestGenreWriteResult, SafeMetadataWriteError> {
    apply_maest_genre_write_state_with(
        state,
        MaestGenreWriteRequest {
            session_id: request.session_id,
            scan_id: request.scan_id,
            genre: request.subgenre,
        },
        alias_path,
        "subgenre",
        write_subgenre_only,
        persist_local_aliases,
    )
}

#[tauri::command(rename_all = "camelCase")]
async fn preview_maest_genre_write(
    state: State<'_, DesktopState>,
    request: MaestGenreWriteRequest,
) -> Result<MaestGenreWritePreview, SafeMetadataWriteError> {
    preview_maest_genre_write_state(&state, &request)
}

#[tauri::command(rename_all = "camelCase")]
async fn apply_maest_genre_write(
    app: AppHandle,
    state: State<'_, DesktopState>,
    request: MaestGenreWriteRequest,
) -> Result<MaestGenreWriteResult, SafeMetadataWriteError> {
    let alias_path = app
        .path()
        .app_data_dir()
        .map_err(|_| {
            SafeMetadataWriteError::new("link_state_failed", "No se pudo abrir el vínculo local.")
        })?
        .join(LIBRARY_FILE_ALIASES_NAME);
    apply_maest_genre_write_state(&state, request, &alias_path)
}

#[tauri::command(rename_all = "camelCase")]
async fn preview_maest_subgenre_write(
    state: State<'_, DesktopState>,
    request: MaestSubgenreWriteRequest,
) -> Result<MaestGenreWritePreview, SafeMetadataWriteError> {
    preview_maest_subgenre_write_state(&state, &request)
}

#[tauri::command(rename_all = "camelCase")]
async fn apply_maest_subgenre_write(
    app: AppHandle,
    state: State<'_, DesktopState>,
    request: MaestSubgenreWriteRequest,
) -> Result<MaestGenreWriteResult, SafeMetadataWriteError> {
    let alias_path = app
        .path()
        .app_data_dir()
        .map_err(|_| {
            SafeMetadataWriteError::new("link_state_failed", "No se pudo abrir el vínculo local.")
        })?
        .join(LIBRARY_FILE_ALIASES_NAME);
    apply_maest_subgenre_write_state(&state, request, &alias_path)
}

fn apply_metadata_writes_state(
    state: &DesktopState,
    request: MetadataWriteRequest,
    alias_path: &Path,
) -> Result<MetadataWriteResult, String> {
    let mut current_session = state
        .scan_session
        .lock()
        .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
    let session = current_session
        .as_mut()
        .filter(|session| session.id == request.session_id)
        .ok_or_else(|| {
            "El escaneo ya no está disponible. Vuelve a seleccionar la carpeta.".to_owned()
        })?;
    let mut history = state
        .metadata_write_history
        .lock()
        .map_err(|_| "No se pudo guardar el historial local de metadatos.".to_owned())?;
    let (run, result) = apply_metadata_write_batch(session, &request)?;
    let aliases = linked_aliases_for_backups(session, &run.backups).map_err(|_| {
        if restore_metadata_run(session, &run.backups) {
            "No se pudo preparar el vínculo local; se restauraron los originales.".to_owned()
        } else {
            "No se pudo restaurar automáticamente un archivo original.".to_owned()
        }
    })?;
    if persist_local_aliases(alias_path, &aliases).is_err() {
        return Err(if restore_metadata_run(session, &run.backups) {
            "No se pudo guardar el vínculo local; se restauraron los originales.".to_owned()
        } else {
            "No se pudo restaurar automáticamente un archivo original.".to_owned()
        });
    }
    history.push(run);
    Ok(result)
}

#[tauri::command(rename_all = "camelCase")]
async fn apply_metadata_writes(
    app: AppHandle,
    state: State<'_, DesktopState>,
    request: MetadataWriteRequest,
) -> Result<MetadataWriteResult, String> {
    let alias_path = app
        .path()
        .app_data_dir()
        .map_err(|_| "No se pudo abrir el estado local de vínculos.".to_owned())?
        .join(LIBRARY_FILE_ALIASES_NAME);
    apply_metadata_writes_state(&state, request, &alias_path)
}

#[derive(Debug)]
struct UndoMetadataWriteError {
    code: &'static str,
    message: String,
}

impl UndoMetadataWriteError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

fn restore_undo_current(
    session: &mut ScanSession,
    current_copies: &[(PathBuf, PathBuf, String)],
) -> bool {
    for (current_copy, original_path, _) in current_copies {
        if fs::copy(current_copy, original_path).is_err() {
            return false;
        }
    }
    for (_, original_path, scan_id) in current_copies {
        let Ok(metadata) = read_audio_metadata(original_path) else {
            return false;
        };
        let Ok(file_metadata) = fs::metadata(original_path) else {
            return false;
        };
        let Ok(updated) =
            update_session_track_after_write(session, scan_id, metadata, file_metadata.len())
        else {
            return false;
        };
        session
            .file_versions
            .insert(updated.relative_path, file_version(&file_metadata));
    }
    true
}

fn undo_metadata_writes_state_with<P>(
    state: &DesktopState,
    session_id: String,
    run_id: String,
    alias_path: &Path,
    persist: P,
) -> Result<MetadataWriteResult, UndoMetadataWriteError>
where
    P: FnOnce(&Path, &[(String, [u8; 32], u64)]) -> Result<(), ()>,
{
    let mut current_session = state.scan_session.lock().map_err(|_| {
        UndoMetadataWriteError::new("undo_failed", "No se pudo actualizar la sesión local.")
    })?;
    let session = current_session
        .as_mut()
        .filter(|session| session.id == session_id)
        .ok_or_else(|| {
            UndoMetadataWriteError::new("undo_failed", {
                "Este historial pertenece a otro escaneo. Selecciona de nuevo la carpeta original."
                    .to_owned()
            })
        })?;
    let mut history = state.metadata_write_history.lock().map_err(|_| {
        UndoMetadataWriteError::new(
            "undo_failed",
            "No se pudo leer el historial local de metadatos.",
        )
    })?;
    let run = history
        .iter()
        .find(|run| run.id == run_id && run.session_id == session_id && !run.undone)
        .cloned()
        .ok_or_else(|| {
            UndoMetadataWriteError::new(
                "undo_failed",
                "La escritura ya no está disponible para deshacer.",
            )
        })?;

    for backup in &run.backups {
        let current_size = fs::metadata(&backup.original_path)
            .map_err(|_| {
                UndoMetadataWriteError::new(
                    "undo_failed",
                    "Un archivo editado ya no está disponible; no se deshizo nada.",
                )
            })?
            .len();
        let current_fingerprint = hash_file(&backup.original_path, current_size)
            .map_err(|message| UndoMetadataWriteError::new("undo_failed", message))?;
        if current_fingerprint != backup.written_fingerprint {
            return Err(UndoMetadataWriteError::new(
                "undo_failed",
                "Un archivo cambió después de escribir sus etiquetas. No se deshizo nada."
                    .to_owned(),
            ));
        }
    }

    let undo_root = session
        .root
        .join(METADATA_BACKUP_DIRECTORY)
        .join(&run.id)
        .join("undo-current");
    let mut current_copies = Vec::with_capacity(run.backups.len());
    for backup in &run.backups {
        let current_copy = undo_root.join(&backup.scan_id);
        if let Some(parent) = current_copy.parent() {
            fs::create_dir_all(parent).map_err(|_| {
                UndoMetadataWriteError::new("undo_failed", "No se pudo preparar el deshacer.")
            })?;
        }
        fs::copy(&backup.original_path, &current_copy).map_err(|_| {
            UndoMetadataWriteError::new("undo_failed", "No se pudo proteger el estado actual.")
        })?;
        current_copies.push((
            current_copy,
            backup.original_path.clone(),
            backup.scan_id.clone(),
        ));
    }

    let mut restored_count = 0;
    for backup in &run.backups {
        if fs::copy(&backup.backup_path, &backup.original_path).is_err() {
            return Err(if restore_undo_current(session, &current_copies) {
                UndoMetadataWriteError::new(
                    "undo_failed",
                    "No se pudo completar el deshacer; se restauró el estado previo al intento.",
                )
            } else {
                UndoMetadataWriteError::new(
                    "restore_failed",
                    "No se pudo recuperar el estado previo al intento de deshacer.",
                )
            });
        }
        restored_count += 1;
    }

    let mut restored_metadata = Vec::with_capacity(run.backups.len());
    for backup in &run.backups {
        let metadata = match read_audio_metadata(&backup.original_path) {
            Ok(metadata) => metadata,
            Err(_) => {
                return Err(if restore_undo_current(session, &current_copies) {
                    UndoMetadataWriteError::new("undo_failed", "No se pudo verificar el archivo restaurado; se revirtió el intento de deshacer.")
                } else {
                    UndoMetadataWriteError::new(
                        "restore_failed",
                        "No se pudo recuperar el estado previo al intento de deshacer.",
                    )
                });
            }
        };
        let size_bytes = match fs::metadata(&backup.original_path) {
            Ok(metadata) => metadata.len(),
            Err(_) => {
                return Err(if restore_undo_current(session, &current_copies) {
                    UndoMetadataWriteError::new("undo_failed", "No se pudo verificar el tamaño restaurado; se revirtió el intento de deshacer.")
                } else {
                    UndoMetadataWriteError::new(
                        "restore_failed",
                        "No se pudo recuperar el estado previo al intento de deshacer.",
                    )
                });
            }
        };
        let fingerprint = match hash_file(&backup.original_path, size_bytes) {
            Ok(fingerprint) => fingerprint,
            Err(_) => {
                return Err(if restore_undo_current(session, &current_copies) {
                    UndoMetadataWriteError::new("undo_failed", "No se pudo verificar la huella restaurada; se revirtió el intento de deshacer.")
                } else {
                    UndoMetadataWriteError::new(
                        "restore_failed",
                        "No se pudo recuperar el estado previo al intento de deshacer.",
                    )
                });
            }
        };
        restored_metadata.push((backup.scan_id.clone(), metadata, size_bytes, fingerprint));
    }
    let mut updated_tracks = Vec::with_capacity(run.backups.len());
    let mut restored_aliases = Vec::new();
    for (scan_id, metadata, size_bytes, fingerprint) in restored_metadata {
        let updated = match update_session_track_after_write(
            session, &scan_id, metadata, size_bytes,
        ) {
            Ok(updated) => updated,
            Err(_) => {
                return Err(if restore_undo_current(session, &current_copies) {
                    UndoMetadataWriteError::new("undo_failed", "No se pudo actualizar la pista restaurada; se revirtió el intento de deshacer.")
                } else {
                    UndoMetadataWriteError::new(
                        "restore_failed",
                        "No se pudo recuperar el estado previo al intento de deshacer.",
                    )
                });
            }
        };
        let restored_file = match session
            .tracks
            .get(&scan_id)
            .and_then(|track| fs::metadata(&track.absolute_path).ok())
        {
            Some(restored_file) => restored_file,
            None => {
                return Err(if restore_undo_current(session, &current_copies) {
                    UndoMetadataWriteError::new("undo_failed", "No se pudo actualizar la versión del archivo restaurado; se revirtió el intento de deshacer.")
                } else {
                    UndoMetadataWriteError::new(
                        "restore_failed",
                        "No se pudo recuperar el estado previo al intento de deshacer.",
                    )
                });
            }
        };
        session
            .file_versions
            .insert(updated.relative_path.clone(), file_version(&restored_file));
        if let Some(track_id) =
            session
                .library_links
                .iter()
                .find_map(|(track_id, linked_scan_id)| {
                    (linked_scan_id == &scan_id).then(|| track_id.clone())
                })
        {
            restored_aliases.push((track_id, fingerprint, size_bytes));
        }
        updated_tracks.push(updated);
    }
    if persist(alias_path, &restored_aliases).is_err() {
        return Err(if restore_undo_current(session, &current_copies) {
            UndoMetadataWriteError::new(
                "link_state_failed",
                "No se pudo conservar el vínculo local; se restauró el estado previo al deshacer.",
            )
        } else {
            UndoMetadataWriteError::new(
                "restore_failed",
                "No se pudo recuperar el estado previo al intento de deshacer.",
            )
        });
    }
    let _ = fs::remove_dir_all(&undo_root);
    if let Some(entry) = history.iter_mut().find(|entry| entry.id == run_id) {
        entry.undone = true;
    }
    Ok(MetadataWriteResult {
        applied_files: restored_count,
        run_id: Some(run_id),
        updated_tracks,
    })
}

fn undo_metadata_writes_state(
    state: &DesktopState,
    session_id: String,
    run_id: String,
    alias_path: &Path,
) -> Result<MetadataWriteResult, UndoMetadataWriteError> {
    undo_metadata_writes_state_with(state, session_id, run_id, alias_path, persist_local_aliases)
}

#[tauri::command(rename_all = "camelCase")]
async fn undo_metadata_writes(
    app: AppHandle,
    state: State<'_, DesktopState>,
    session_id: String,
    run_id: String,
) -> Result<MetadataWriteResult, String> {
    let alias_path = app
        .path()
        .app_data_dir()
        .map_err(|_| "No se pudo abrir el estado local de vínculos.".to_owned())?
        .join(LIBRARY_FILE_ALIASES_NAME);
    undo_metadata_writes_state(&state, session_id, run_id, &alias_path)
        .map_err(|error| error.message)
}

#[tauri::command(rename_all = "camelCase")]
async fn undo_maest_genre_write(
    app: AppHandle,
    state: State<'_, DesktopState>,
    session_id: String,
    run_id: String,
) -> Result<MaestGenreWriteResult, SafeMetadataWriteError> {
    let alias_path = app
        .path()
        .app_data_dir()
        .map_err(|_| {
            SafeMetadataWriteError::new(
                "link_state_failed",
                "No se pudo abrir el estado local de vínculos.",
            )
        })?
        .join(LIBRARY_FILE_ALIASES_NAME);
    undo_metadata_writes_state(&state, session_id, run_id, &alias_path)
        .map(|result| MaestGenreWriteResult {
            applied_files: result.applied_files,
            run_id: result.run_id,
        })
        .map_err(|error| {
            SafeMetadataWriteError::new(error.code, "No se pudo deshacer la escritura.")
        })
}

#[tauri::command(rename_all = "camelCase")]
async fn list_metadata_write_history(
    state: State<'_, DesktopState>,
    session_id: String,
) -> Result<Vec<MetadataWriteHistoryItem>, String> {
    let history = state
        .metadata_write_history
        .lock()
        .map_err(|_| "No se pudo leer el historial local de metadatos.".to_owned())?;
    Ok(history
        .iter()
        .rev()
        .filter(|run| run.session_id == session_id)
        .take(20)
        .map(|run| MetadataWriteHistoryItem {
            created_at: run.created_at,
            file_count: run.backups.len(),
            run_id: run.id.clone(),
            undone: run.undone,
        })
        .collect())
}

#[tauri::command(rename_all = "camelCase")]
async fn preview_reorganization_plan(
    state: State<'_, DesktopState>,
    request: ReorganizationRequest,
) -> Result<ReorganizationResult, String> {
    let current_session = state
        .scan_session
        .lock()
        .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
    let session = current_session
        .as_ref()
        .filter(|session| session.id == request.session_id)
        .ok_or_else(|| {
            "El escaneo ya no está disponible. Vuelve a seleccionar la carpeta.".to_owned()
        })?;
    let moves = build_reorganization_plan(session, &request.track_ids, &request.scheme)?;
    Ok(ReorganizationResult {
        applied: false,
        moves: moves
            .into_iter()
            .map(|item| ReorganizationMove {
                scan_id: item.scan_id,
                source_path: relative_display(&session.root, &item.source),
                target_path: relative_display(&session.root, &item.target),
            })
            .collect(),
        run_id: None,
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn apply_reorganization_plan(
    state: State<'_, DesktopState>,
    request: ReorganizationRequest,
) -> Result<ReorganizationResult, String> {
    let (run, result_moves) = {
        let mut current_session = state
            .scan_session
            .lock()
            .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
        let session = current_session
            .as_mut()
            .filter(|session| session.id == request.session_id)
            .ok_or_else(|| {
                "El escaneo ya no está disponible. Vuelve a seleccionar la carpeta.".to_owned()
            })?;
        let moves = build_reorganization_plan(session, &request.track_ids, &request.scheme)?;
        if moves.is_empty() {
            return Ok(ReorganizationResult {
                applied: true,
                moves: Vec::new(),
                run_id: None,
            });
        }

        let run_id = operation_id("reorganization")?;
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "No se pudo fechar la operación.".to_owned())?
            .as_secs();
        let mut completed = Vec::with_capacity(moves.len());
        for planned in &moves {
            if let Some(parent) = planned.target.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    rollback_moves(&completed);
                    format!("No se pudo crear una carpeta del plan: {error}")
                })?;
            }
            if planned.target.exists() {
                rollback_moves(&completed);
                return Err(
                    "Apareció una colisión después de la previsualización. No se aplicó el plan."
                        .to_owned(),
                );
            }
            if let Err(error) = fs::rename(&planned.source, &planned.target) {
                rollback_moves(&completed);
                return Err(format!(
                    "No se pudo mover un archivo; los movimientos anteriores se revirtieron: {error}"
                ));
            }
            completed.push(planned.clone());
        }

        for applied in &completed {
            if let Some(session_track) = session.tracks.get_mut(&applied.scan_id) {
                session_track.absolute_path = applied.target.clone();
                session_track.track.relative_path =
                    relative_display(&session.root, &applied.target);
            }
        }

        let result_moves = completed
            .iter()
            .map(|item| ReorganizationMove {
                scan_id: item.scan_id.clone(),
                source_path: relative_display(&session.root, &item.source),
                target_path: relative_display(&session.root, &item.target),
            })
            .collect::<Vec<_>>();
        (
            ReorganizationRun {
                created_at,
                id: run_id,
                moves: completed,
                session_id: request.session_id.clone(),
                undone: false,
            },
            result_moves,
        )
    };

    let run_id = run.id.clone();
    state
        .reorganization_history
        .lock()
        .map_err(|_| "No se pudo guardar el historial local.".to_owned())?
        .push(run);
    Ok(ReorganizationResult {
        applied: true,
        moves: result_moves,
        run_id: Some(run_id),
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn undo_reorganization(
    state: State<'_, DesktopState>,
    run_id: String,
) -> Result<ReorganizationResult, String> {
    let run = {
        let history = state
            .reorganization_history
            .lock()
            .map_err(|_| "No se pudo leer el historial local.".to_owned())?;
        history
            .iter()
            .find(|run| run.id == run_id && !run.undone)
            .cloned()
            .ok_or_else(|| "La operación ya no está disponible para deshacer.".to_owned())?
    };

    let mut current_session = state
        .scan_session
        .lock()
        .map_err(|_| "No se pudo actualizar la sesión local.".to_owned())?;
    let session = current_session
        .as_mut()
        .filter(|session| session.id == run.session_id)
        .ok_or_else(|| {
            "Este historial pertenece a otro escaneo. Selecciona de nuevo la carpeta original."
                .to_owned()
        })?;

    let mut reversed = Vec::with_capacity(run.moves.len());
    for original in run.moves.iter().rev() {
        if !original.target.exists() || original.source.exists() {
            rollback_moves(&reversed);
            return Err(
                "Los archivos cambiaron desde la reorganización. No se deshizo nada.".to_owned(),
            );
        }
        if let Some(parent) = original.source.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                rollback_moves(&reversed);
                return Err(format!("No se pudo restaurar una carpeta: {error}"));
            }
        }
        fs::rename(&original.target, &original.source).map_err(|error| {
            rollback_moves(&reversed);
            format!("No se pudo completar el deshacer: {error}")
        })?;
        reversed.push(AppliedMove {
            scan_id: original.scan_id.clone(),
            source: original.target.clone(),
            target: original.source.clone(),
        });
    }

    for original in &run.moves {
        if let Some(session_track) = session.tracks.get_mut(&original.scan_id) {
            session_track.absolute_path = original.source.clone();
            session_track.track.relative_path = relative_display(&session.root, &original.source);
        }
    }
    let result_moves = run
        .moves
        .iter()
        .rev()
        .map(|item| ReorganizationMove {
            scan_id: item.scan_id.clone(),
            source_path: relative_display(&session.root, &item.target),
            target_path: relative_display(&session.root, &item.source),
        })
        .collect();
    drop(current_session);

    let mut history = state
        .reorganization_history
        .lock()
        .map_err(|_| "No se pudo actualizar el historial local.".to_owned())?;
    if let Some(entry) = history.iter_mut().find(|entry| entry.id == run_id) {
        entry.undone = true;
    }
    Ok(ReorganizationResult {
        applied: true,
        moves: result_moves,
        run_id: Some(run_id),
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn list_reorganization_history(
    state: State<'_, DesktopState>,
    session_id: String,
) -> Result<Vec<ReorganizationHistoryItem>, String> {
    let history = state
        .reorganization_history
        .lock()
        .map_err(|_| "No se pudo leer el historial local.".to_owned())?;
    Ok(history
        .iter()
        .rev()
        .filter(|run| run.session_id == session_id)
        .take(20)
        .map(|run| ReorganizationHistoryItem {
            created_at: run.created_at,
            move_count: run.moves.len(),
            run_id: run.id.clone(),
            undone: run.undone,
        })
        .collect())
}

fn session_tracks_for_library_ids(
    session: &ScanSession,
    track_ids: &[String],
) -> Result<Vec<SessionTrack>, String> {
    if track_ids.is_empty() {
        return Ok(Vec::new());
    }
    let scan_ids = track_ids
        .iter()
        .map(|track_id| {
            session.library_links.get(track_id).cloned().ok_or_else(|| {
                "Una pista del crate no está vinculada a un archivo del escaneo activo.".to_owned()
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    selected_session_tracks_from_session(session, &scan_ids)
}

fn write_with_backup(destination: &Path, contents: &str) -> Result<bool, String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "El destino de exportación no es válido.".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("No se pudo crear la jerarquía de listas: {error}"))?;
    let temporary = destination.with_extension("xml.djorganizer.tmp");
    fs::write(&temporary, contents)
        .map_err(|error| format!("No se pudo preparar una lista: {error}"))?;
    let backup = destination.with_extension(format!(
        "xml.bak-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "No se pudo crear la copia de seguridad.".to_owned())?
            .as_secs()
    ));
    let backed_up = destination.exists();
    if backed_up {
        fs::rename(destination, &backup)
            .map_err(|error| format!("No se pudo proteger la lista existente: {error}"))?;
    }
    if let Err(error) = fs::rename(&temporary, destination) {
        if backed_up {
            let _ = fs::rename(&backup, destination);
        }
        return Err(format!("No se pudo guardar la lista: {error}"));
    }
    Ok(backed_up)
}

/// Publishes an export without replacing a file created after the save dialog.
///
/// A hard link is an atomic, no-clobber directory entry creation operation: it
/// succeeds only while `destination` does not exist. The temporary file lives
/// in the destination directory, so both names are guaranteed to be on the
/// same filesystem. Once linked, removing the temporary name leaves the
/// published file intact.
fn write_rekordbox_xml_no_clobber<F>(
    destination: &Path,
    contents: &[u8],
    before_publish: F,
) -> Result<(), String>
where
    F: FnOnce(&Path) -> Result<(), String>,
{
    let parent = destination
        .parent()
        .ok_or_else(|| "El destino de exportación no es válido.".to_owned())?;
    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("rekordbox.xml");
    let temporary = parent.join(format!(
        ".{file_name}.djorganizer-{}-{}.tmp",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "No se pudo crear el XML temporal.".to_owned())?
            .as_nanos()
    ));

    let mut temporary_created = false;
    let result = (|| -> Result<(), String> {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| format!("No se pudo preparar el XML: {error}"))?;
        temporary_created = true;
        file.write_all(contents)
            .map_err(|error| format!("No se pudo escribir el XML: {error}"))?;
        file.flush()
            .map_err(|error| format!("No se pudo vaciar el XML: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("No se pudo sincronizar el XML: {error}"))?;
        drop(file);

        before_publish(&temporary)?;
        fs::hard_link(&temporary, destination).map_err(|error| {
            if error.kind() == std::io::ErrorKind::AlreadyExists {
                "destination_exists".to_owned()
            } else {
                format!("No se pudo publicar el XML: {error}")
            }
        })?;
        fs::remove_file(&temporary)
            .map_err(|error| format!("No se pudo finalizar el XML: {error}"))?;
        Ok(())
    })();

    if result.is_err() && temporary_created {
        // This function created the temporary file, so cleanup never touches
        // the user-selected destination or a stale temporary from another run.
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[tauri::command(rename_all = "camelCase")]
async fn export_virtualdj_crates(
    app: AppHandle,
    state: State<'_, DesktopState>,
    crates: Vec<VirtualDjCrateInput>,
    session_id: String,
) -> Result<VirtualDjBatchExportResult, String> {
    if crates.is_empty() || crates.len() > 200 {
        return Err("Selecciona entre 1 y 200 crates.".to_owned());
    }
    let total_tracks = crates
        .iter()
        .map(|item| item.track_ids.len())
        .sum::<usize>();
    if total_tracks > MAX_TRACKS {
        return Err("La exportación admite hasta 10.000 pistas.".to_owned());
    }
    let destination = app
        .dialog()
        .file()
        .set_title("Selecciona la carpeta My Lists de VirtualDJ")
        .blocking_pick_folder();
    let Some(destination) = destination else {
        return Ok(VirtualDjBatchExportResult {
            backed_up_files: 0,
            cancelled: true,
            exported_lists: 0,
            exported_tracks: 0,
        });
    };
    let destination = destination
        .into_path()
        .map_err(|error| format!("La carpeta elegida no es una ruta local válida: {error}"))?;

    let prepared = {
        let current_session = state
            .scan_session
            .lock()
            .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
        let session = current_session
            .as_ref()
            .filter(|session| session.id == session_id)
            .ok_or_else(|| {
                "Vuelve a escanear tu biblioteca antes de exportar crates.".to_owned()
            })?;
        crates
            .iter()
            .map(|item| {
                validate_virtualdj_list_name(&item.name)?;
                if item.hierarchy.len() > 8 {
                    return Err("La jerarquía supera ocho niveles.".to_owned());
                }
                let tracks = session_tracks_for_library_ids(session, &item.track_ids)?;
                let xml = build_virtualdj_list_xml(&tracks)?;
                let mut relative = PathBuf::new();
                for level in &item.hierarchy {
                    relative.push(safe_path_segment(Some(level), "Sin nombre"));
                }
                relative.push(format!(
                    "{}.xml",
                    safe_path_segment(Some(&item.name), "DJOrganizer")
                ));
                Ok((relative, xml, tracks.len()))
            })
            .collect::<Result<Vec<_>, String>>()?
    };

    let mut unique_destinations = HashSet::with_capacity(prepared.len());
    for (relative, _, _) in &prepared {
        if !unique_destinations.insert(relative.to_string_lossy().to_ascii_lowercase()) {
            return Err(
                "Dos crates generan la misma ruta de VirtualDJ después de sanear sus nombres."
                    .to_owned(),
            );
        }
    }

    let mut backed_up_files = 0;
    let mut exported_tracks = 0;
    for (relative, xml, tracks) in &prepared {
        if write_with_backup(&destination.join(relative), xml)? {
            backed_up_files += 1;
        }
        exported_tracks += *tracks;
    }
    Ok(VirtualDjBatchExportResult {
        backed_up_files,
        cancelled: false,
        exported_lists: prepared.len(),
        exported_tracks,
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn preview_rekordbox_export(
    state: State<'_, DesktopState>,
    crates: Vec<RekordboxCrateInput>,
    session_id: String,
) -> Result<RekordboxExportPreview, String> {
    if crates.is_empty() || crates.len() > MAX_REKORDBOX_CRATES {
        return Err("Selecciona entre 1 y 200 crates.".to_owned());
    }
    let session = state
        .scan_session
        .lock()
        .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
    let session = session
        .as_ref()
        .filter(|session| session.id == session_id)
        .ok_or_else(|| {
            "El escaneo ya no está disponible. Vuelve a seleccionar la carpeta.".to_owned()
        })?;
    let mut names = HashSet::new();
    let mut duplicate_names = Vec::new();
    let mut linked_tracks = 0;
    let mut excluded_tracks = 0;
    let mut unlinked_track_ids = Vec::new();
    for crate_input in &crates {
        if crate_input.hierarchy.len() > 8
            || crate_input.name.trim().is_empty()
            || crate_input.name.chars().count() > 120
        {
            return Err("El nombre o la jerarquía del crate no son válidos.".to_owned());
        }
        let key = format!("{}/{}", crate_input.hierarchy.join("/"), crate_input.name);
        if !names.insert(key.clone()) {
            duplicate_names.push(key);
        }
        for track_id in &crate_input.track_ids {
            if session.library_links.contains_key(track_id) {
                linked_tracks += 1
            } else {
                excluded_tracks += 1;
                unlinked_track_ids.push(track_id.clone());
            }
        }
    }
    Ok(RekordboxExportPreview {
        duplicate_names,
        excluded_tracks,
        linked_tracks,
        playlists: crates.len(),
        total_tracks: linked_tracks + excluded_tracks,
        unlinked_track_ids,
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn export_rekordbox_xml(
    app: AppHandle,
    state: State<'_, DesktopState>,
    crates: Vec<RekordboxCrateInput>,
    excluded_track_ids: Vec<String>,
    session_id: String,
    confirmed: bool,
) -> Result<RekordboxExportResult, String> {
    if !confirmed {
        return Err("Confirma explícitamente la exportación de Rekordbox.".to_owned());
    }
    let preview =
        preview_rekordbox_export(state.clone(), crates.clone(), session_id.clone()).await?;
    if !preview.duplicate_names.is_empty() {
        return Err("Hay nombres de crates duplicados en el mismo nivel.".to_owned());
    }
    let excluded = excluded_track_ids.into_iter().collect::<HashSet<_>>();
    let prepared = {
        let guard = state
            .scan_session
            .lock()
            .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
        let session = guard
            .as_ref()
            .filter(|session| session.id == session_id)
            .ok_or_else(|| {
                "El escaneo ya no está disponible. Vuelve a seleccionar la carpeta.".to_owned()
            })?;
        let expected_exclusions = crates
            .iter()
            .flat_map(|crate_input| crate_input.track_ids.iter())
            .filter(|id| !session.library_links.contains_key(*id))
            .cloned()
            .collect::<HashSet<_>>();
        if excluded != expected_exclusions {
            return Err("Las exclusiones confirmadas no coinciden exactamente con la previsualización actual. Vuelve a revisar las pistas sin vínculo.".to_owned());
        }
        crates.into_iter().map(|crate_input| {
            let mut tracks = Vec::new();
            for id in &crate_input.track_ids {
                match session.library_links.get(id).and_then(|scan_id| session.tracks.get(scan_id)).cloned() {
                    Some(track) => {
                        let metadata = fs::metadata(&track.absolute_path).map_err(|_| "Un archivo vinculado ya no existe. Vuelve a escanear antes de exportar.".to_owned())?;
                        if !metadata.is_file() || metadata.len() != track.track.size_bytes || !track.absolute_path.is_absolute() || export_path_text(&track.absolute_path).is_err() {
                            return Err("Un archivo vinculado cambió desde el escaneo. Vuelve a escanear antes de exportar.".to_owned());
                        }
                        tracks.push(track)
                    }
                    None if excluded.contains(id) => (),
                    None => return Err("Hay pistas sin vínculo local. Confirma sus exclusiones antes de exportar.".to_owned()),
                }
            }
            Ok((crate_input, tracks))
        }).collect::<Result<Vec<_>, String>>()?
    };
    let xml = build_rekordbox_xml(&prepared)?;
    let destination = app
        .dialog()
        .file()
        .set_title("Guardar XML para Rekordbox")
        .set_file_name("DJOrganizer-Rekordbox.xml")
        .add_filter("Rekordbox XML", &["xml"])
        .blocking_save_file();
    let Some(destination) = destination else {
        return Ok(RekordboxExportResult {
            cancelled: true,
            exported_playlists: 0,
            exported_tracks: 0,
        });
    };
    let destination = destination
        .into_path()
        .map_err(|error| format!("El destino elegido no es una ruta local válida: {error}"))?;
    if destination.exists() {
        return Err("destination_exists".to_owned());
    }
    write_rekordbox_xml_no_clobber(&destination, xml.as_bytes(), |_| Ok(()))?;
    Ok(RekordboxExportResult {
        cancelled: false,
        exported_playlists: prepared.len(),
        exported_tracks: prepared.iter().map(|(_, tracks)| tracks.len()).sum(),
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn import_virtualdj_my_lists(
    app: AppHandle,
    state: State<'_, DesktopState>,
    session_id: String,
) -> Result<VirtualDjImportPreview, String> {
    let selection = app
        .dialog()
        .file()
        .set_title("Selecciona la carpeta My Lists de VirtualDJ")
        .blocking_pick_folder();
    let Some(selection) = selection else {
        return Ok(VirtualDjImportPreview {
            cancelled: true,
            lists: Vec::new(),
        });
    };
    let root = selection
        .into_path()
        .map_err(|error| format!("La carpeta elegida no es una ruta local válida: {error}"))?;

    let path_to_track_id = {
        let current_session = state
            .scan_session
            .lock()
            .map_err(|_| "No se pudo proteger la sesión del escaneo.".to_owned())?;
        let Some(session) = current_session
            .as_ref()
            .filter(|session| session.id == session_id)
        else {
            return Err("Vuelve a escanear tu biblioteca antes de importar Lists.".to_owned());
        };
        let reverse_links = session
            .library_links
            .iter()
            .map(|(track_id, scan_id)| (scan_id, track_id))
            .collect::<HashMap<_, _>>();
        session
            .tracks
            .values()
            .filter_map(|track| {
                reverse_links.get(&track.track.scan_id).map(|track_id| {
                    (
                        track.absolute_path.to_string_lossy().to_ascii_lowercase(),
                        (*track_id).clone(),
                    )
                })
            })
            .collect::<HashMap<_, _>>()
    };

    let mut files = Vec::new();
    let mut pending = vec![root.clone()];
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(&directory)
            .map_err(|error| format!("No se pudo leer My Lists: {error}"))?
        {
            let entry = entry.map_err(|error| format!("No se pudo leer una entrada: {error}"))?;
            let path = entry.path();
            let kind = entry
                .file_type()
                .map_err(|error| format!("No se pudo comprobar una entrada: {error}"))?;
            if kind.is_dir() {
                pending.push(path);
            } else if kind.is_file()
                && path
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.eq_ignore_ascii_case("xml"))
            {
                files.push(path);
                if files.len() > 500 {
                    return Err("My Lists contiene más de 500 listas.".to_owned());
                }
            }
        }
    }
    files.sort();

    let mut lists = Vec::with_capacity(files.len());
    for file in files {
        let xml = fs::read_to_string(&file)
            .map_err(|error| format!("No se pudo leer una List: {error}"))?;
        let paths = parse_virtualdj_paths(&xml)?;
        let mut linked_track_ids = Vec::new();
        let mut unresolved_paths = Vec::new();
        for path in paths {
            if let Some(track_id) = path_to_track_id.get(&path.to_ascii_lowercase()) {
                linked_track_ids.push(track_id.clone());
            } else {
                unresolved_paths.push(path);
            }
        }
        lists.push(VirtualDjImportedList {
            linked_track_ids,
            name: file
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("VirtualDJ")
                .to_owned(),
            relative_path: relative_display(&root, &file),
            unresolved_paths,
        });
    }
    Ok(VirtualDjImportPreview {
        cancelled: false,
        lists,
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn export_virtualdj_list(
    app: AppHandle,
    state: State<'_, DesktopState>,
    session_id: String,
    track_ids: Vec<String>,
    list_name: String,
) -> Result<VirtualDjExportResult, String> {
    let list_name = validate_virtualdj_list_name(&list_name)?;
    let selected_tracks = selected_session_tracks(state.inner(), &session_id, &track_ids)?;

    let default_name = format!("{}.xml", safe_export_file_name(list_name));
    let destination = app
        .dialog()
        .file()
        .set_title("Guardar lista para VirtualDJ")
        .set_file_name(default_name)
        .add_filter("VirtualDJ List", &["xml"])
        .blocking_save_file();

    let Some(destination) = destination else {
        return Ok(VirtualDjExportResult {
            cancelled: true,
            exported_tracks: 0,
        });
    };
    let destination = destination
        .into_path()
        .map_err(|error| format!("El destino elegido no es una ruta local válida: {error}"))?;
    let xml = build_virtualdj_list_xml(&selected_tracks)?;
    fs::write(destination, xml)
        .map_err(|error| format!("No se pudo guardar la lista de VirtualDJ: {error}"))?;

    Ok(VirtualDjExportResult {
        cancelled: false,
        exported_tracks: selected_tracks.len(),
    })
}

#[tauri::command(rename_all = "camelCase")]
async fn export_virtualdj_m3u8(
    app: AppHandle,
    state: State<'_, DesktopState>,
    session_id: String,
    track_ids: Vec<String>,
    list_name: String,
) -> Result<VirtualDjExportResult, String> {
    let list_name = validate_virtualdj_list_name(&list_name)?;
    let selected_tracks = selected_session_tracks(state.inner(), &session_id, &track_ids)?;
    let m3u8 = build_virtualdj_m3u8(&selected_tracks)?;

    let default_name = format!("{}.m3u8", safe_export_file_name(list_name));
    let destination = app
        .dialog()
        .file()
        .set_title("Guardar lista M3U8 para VirtualDJ")
        .set_file_name(default_name)
        .add_filter("M3U8 Playlist", &["m3u8"])
        .blocking_save_file();

    let Some(destination) = destination else {
        return Ok(VirtualDjExportResult {
            cancelled: true,
            exported_tracks: 0,
        });
    };
    let destination = destination
        .into_path()
        .map_err(|error| format!("El destino elegido no es una ruta local válida: {error}"))?;
    fs::write(destination, m3u8)
        .map_err(|error| format!("No se pudo guardar la lista M3U8: {error}"))?;

    Ok(VirtualDjExportResult {
        cancelled: false,
        exported_tracks: selected_tracks.len(),
    })
}

#[tauri::command]
async fn check_for_updates(app: AppHandle) -> Result<DesktopUpdateStatus, String> {
    let update = app
        .updater()
        .map_err(|error| format!("El actualizador no está configurado: {error}"))?
        .check()
        .await
        .map_err(|error| format!("No se pudo comprobar la actualización: {error}"))?;

    Ok(match update {
        Some(update) => DesktopUpdateStatus {
            available: true,
            notes: update.body,
            version: Some(update.version),
        },
        None => DesktopUpdateStatus {
            available: false,
            notes: None,
            version: None,
        },
    })
}

#[tauri::command]
async fn install_available_update(app: AppHandle) -> Result<DesktopUpdateStatus, String> {
    let Some(update) = app
        .updater()
        .map_err(|error| format!("El actualizador no está configurado: {error}"))?
        .check()
        .await
        .map_err(|error| format!("No se pudo comprobar la actualización: {error}"))?
    else {
        return Ok(DesktopUpdateStatus {
            available: false,
            notes: None,
            version: None,
        });
    };
    let version = update.version.clone();
    let notes = update.body.clone();
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| format!("No se pudo instalar la actualización: {error}"))?;
    Ok(DesktopUpdateStatus {
        available: true,
        notes,
        version: Some(version),
    })
}

/// Starts the desktop application.
///
/// The native scan command opens an operating-system folder picker and performs
/// a bounded local scan. Every file operation accepts only opaque identifiers
/// from that scan, derives paths inside the confirmed root and verifies external
/// changes immediately before applying a reversible operation.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(DesktopState::default())
        .manage(maest::MaestState::default())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .invoke_handler(tauri::generate_handler![
            maest::prepare_maest_model,
            begin_maest_analysis,
            analyze_scanned_track,
            get_maest_analysis_progress,
            cancel_maest_analysis,
            release_maest_analysis,
            choose_and_scan_music_folder,
            scan_music_folder_incrementally,
            link_library_tracks,
            preview_maest_genre_write,
            apply_maest_genre_write,
            preview_maest_subgenre_write,
            apply_maest_subgenre_write,
            preview_metadata_writes,
            apply_metadata_writes,
            undo_metadata_writes,
            undo_maest_genre_write,
            list_metadata_write_history,
            preview_reorganization_plan,
            apply_reorganization_plan,
            undo_reorganization,
            list_reorganization_history,
            export_virtualdj_list,
            export_virtualdj_m3u8,
            export_virtualdj_crates,
            preview_rekordbox_export,
            export_rekordbox_xml,
            import_virtualdj_my_lists,
            check_for_updates,
            install_available_update
        ])
        .run(tauri::generate_context!())
        .expect("failed to run DJOrganizer desktop");
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    use super::export_path_text;
    use super::{
        apply_maest_genre_write_state, apply_maest_genre_write_state_with,
        apply_metadata_write_batch, apply_metadata_writes_state, audio_extension,
        build_metadata_write_preview, build_rekordbox_xml, build_reorganization_plan,
        build_virtualdj_list_xml, build_virtualdj_m3u8, confirmed_maest_genre_preview,
        count_incremental_changes, create_track_path_id, file_version, fingerprint_text, hash_file,
        link_library_candidates, link_library_candidates_with_aliases, parse_bpm,
        parse_mp4_bpm_value, parse_virtualdj_paths, persist_local_aliases,
        preview_maest_genre_write_state, read_audio_metadata, read_local_alias_store,
        register_local_alias, rekordbox_file_uri, restore_metadata_backups, safe_export_file_name,
        safe_path_segment, scan_music_folder, scan_music_folder_with_previous,
        undo_metadata_writes_state, undo_metadata_writes_state_with, update_alias_anchors,
        write_genre_only, write_local_alias_store, write_metadata_to_file,
        write_rekordbox_xml_no_clobber, DesktopState, LibraryLinkCandidate, LocalFileIdentity,
        LocalLibraryFileAliases, LocalTrackAliases, MaestGenreWriteRequest, MetadataEditInput,
        MetadataWriteRequest, OrganizationScheme, RekordboxCrateInput, ScanSession,
        ScannedAudioFile, SessionTrack, MAX_LIBRARY_FILE_ALIASES_PER_TRACK,
    };
    const TEST_LIBRARY_TRACK_ID: &str = "11111111-1111-4111-8111-111111111111";
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use lofty::mp4::AtomData;
    use sha2::{Digest, Sha256};
    use std::{
        collections::HashMap,
        fs,
        io::Write,
        path::Path,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_directory() -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "djorganizer-folder-scan-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("test directory should be created");
        path
    }

    fn one_second_wav() -> Vec<u8> {
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

    fn tagged_flac_fixture() -> Vec<u8> {
        STANDARD
            .decode(include_str!(
                "../tests/fixtures/audio-decoder-sine.flac.b64"
            ))
            .expect("FLAC fixture should decode")
    }

    #[test]
    fn recognizes_supported_extensions_case_insensitively() {
        assert_eq!(
            audio_extension(Path::new("track.MP3")).as_deref(),
            Some("mp3")
        );
        assert_eq!(
            audio_extension(Path::new("track.flac")).as_deref(),
            Some("flac")
        );
        assert_eq!(audio_extension(Path::new("notes.txt")), None);
    }

    #[test]
    fn parses_only_plausible_bpm_values() {
        assert_eq!(parse_bpm("128"), Some(128.0));
        assert_eq!(parse_bpm("124,5"), Some(124.5));
        assert_eq!(parse_bpm("0"), None);
        assert_eq!(parse_bpm("not-a-number"), None);
    }

    #[test]
    fn parses_numeric_mp4_bpm_values() {
        assert_eq!(
            parse_mp4_bpm_value(&AtomData::SignedInteger(128)),
            Some(128.0)
        );
        assert_eq!(
            parse_mp4_bpm_value(&AtomData::UnsignedInteger(124)),
            Some(124.0)
        );
        assert_eq!(parse_mp4_bpm_value(&AtomData::SignedInteger(0)), None);
    }

    #[test]
    fn reads_audio_properties_without_requiring_tags() {
        let root = test_directory();
        let file = root.join("one-second.wav");
        fs::write(&file, one_second_wav()).expect("WAV fixture should be written");

        let metadata = read_audio_metadata(&file).expect("WAV metadata should be read");

        assert!(metadata
            .duration_seconds
            .is_some_and(|duration| (0.9..=1.1).contains(&duration)));
        assert_eq!(metadata.title, None);
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn previews_writes_and_restores_the_full_audio_backup() {
        let root = test_directory();
        let file = root.join("editable.wav");
        let original = one_second_wav();
        fs::write(&file, &original).expect("WAV fixture should be written");
        let completed = scan_music_folder(&root, "metadata-session".to_owned())
            .expect("folder should be scanned");
        let scan_id = completed.result.tracks[0].scan_id.clone();
        let mut session = ScanSession {
            file_versions: completed.file_versions,
            id: "metadata-session".to_owned(),
            incremental_scan_active: false,
            root: root.clone(),
            tracks: completed
                .session_tracks
                .into_iter()
                .map(|track| (track.track.scan_id.clone(), track))
                .collect(),
            truncated: false,
            library_links: HashMap::new(),
        };
        let request = MetadataWriteRequest {
            edits: vec![MetadataEditInput {
                album: String::new(),
                artist: String::new(),
                bpm: None,
                genre: String::new(),
                musical_key: String::new(),
                scan_id: scan_id.clone(),
                title: "Opening Tool".to_owned(),
            }],
            session_id: session.id.clone(),
        };

        let (preview, _) =
            build_metadata_write_preview(&session, &request).expect("preview should be valid");
        assert_eq!(preview.files.len(), 1);
        assert_eq!(preview.files[0].changes[0].field, "title");

        let (run, result) =
            apply_metadata_write_batch(&mut session, &request).expect("write should succeed");
        assert_eq!(result.applied_files, 1);
        assert_eq!(
            read_audio_metadata(&file)
                .expect("written metadata should be readable")
                .title
                .as_deref(),
            Some("Opening Tool")
        );
        assert!(run.backups[0].backup_path.exists());
        assert!(restore_metadata_backups(&run.backups));
        assert_eq!(
            fs::read(&file).expect("restored audio should be readable"),
            original
        );
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    fn maest_genre_fixture(
        session_id: &str,
        file_name: &str,
    ) -> (
        std::path::PathBuf,
        std::path::PathBuf,
        DesktopState,
        MaestGenreWriteRequest,
        super::AudioMetadata,
        Vec<u8>,
    ) {
        let root = test_directory();
        let file = root.join(file_name);
        fs::write(&file, tagged_flac_fixture()).expect("FLAC fixture should be written");
        write_metadata_to_file(
            &file,
            &MetadataEditInput {
                album: "Album".into(),
                artist: "Artist".into(),
                bpm: Some(128.0),
                genre: "House".into(),
                musical_key: "8A".into(),
                scan_id: "setup".into(),
                title: "Title".into(),
            },
        )
        .expect("initial metadata should be written");
        let original_metadata = read_audio_metadata(&file).unwrap();
        let original_bytes = fs::read(&file).unwrap();
        let completed =
            scan_music_folder(&root, session_id.to_owned()).expect("folder should be scanned");
        let scan_id = completed.result.tracks[0].scan_id.clone();
        let session = ScanSession {
            file_versions: completed.file_versions,
            id: session_id.to_owned(),
            incremental_scan_active: false,
            root: root.clone(),
            tracks: completed
                .session_tracks
                .into_iter()
                .map(|track| (track.track.scan_id.clone(), track))
                .collect(),
            truncated: false,
            library_links: HashMap::from([(TEST_LIBRARY_TRACK_ID.into(), scan_id.clone())]),
        };
        let alias_path = root.join("aliases.json");
        let fingerprint =
            fingerprint_text(hash_file(&file, fs::metadata(&file).unwrap().len()).unwrap());
        let mut alias_store = LocalLibraryFileAliases::default();
        update_alias_anchors(
            &mut alias_store,
            &[LibraryLinkCandidate {
                file_fingerprint: fingerprint,
                file_size: fs::metadata(&file).unwrap().len(),
                track_id: TEST_LIBRARY_TRACK_ID.into(),
            }],
            [TEST_LIBRARY_TRACK_ID.to_owned()].into_iter(),
        );
        write_local_alias_store(&alias_path, &alias_store).unwrap();
        let state = DesktopState::default();
        *state.scan_session.lock().unwrap() = Some(session);
        let request = MaestGenreWriteRequest {
            session_id: session_id.to_owned(),
            scan_id,
            genre: "  Electronic  ".into(),
        };
        (
            root,
            file,
            state,
            request,
            original_metadata,
            original_bytes,
        )
    }

    #[test]
    fn maest_genre_preview_creates_a_private_safe_receipt_without_writing() {
        let (root, file, state, request, _, original_bytes) =
            maest_genre_fixture("genre-session", "genre-only.flac");
        let preview = preview_maest_genre_write_state(&state, &request).unwrap();
        assert_eq!(preview.before.as_deref(), Some("House"));
        assert_eq!(preview.after, "Electronic");
        assert!(preview.changed);
        assert_eq!(fs::read(&file).unwrap(), original_bytes);
        assert_eq!(state.pending_maest_genre_previews.lock().unwrap().len(), 1);
        let public = serde_json::to_string(&preview).unwrap();
        assert!(!public.contains("path"));
        assert!(!public.contains("fingerprint"));
        assert!(!public.contains("identity"));
        assert!(!public.contains("version"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maest_subgenre_preview_apply_and_undo_round_trip_independently() {
        let (root, file, state, genre_request, before, original) =
            maest_genre_fixture("subgenre-session", "subgenre.flac");
        let request = MaestSubgenreWriteRequest {
            session_id: genre_request.session_id,
            scan_id: genre_request.scan_id,
            subgenre: "Deep House".into(),
        };
        let preview = preview_maest_subgenre_write_state(&state, &request).unwrap();
        assert_eq!(preview.field, "subgenre");
        assert_eq!(preview.before, None);
        assert_eq!(preview.after, "Deep House");
        assert!(preview.changed);
        let run_id = apply_maest_subgenre_write_state(&state, request, &root.join("aliases.json"))
            .unwrap()
            .run_id
            .unwrap();
        let written = read_audio_metadata(&file).unwrap();
        assert_eq!(written.subgenre.as_deref(), Some("Deep House"));
        assert_eq!(written.genre, before.genre);
        undo_metadata_writes_state(
            &state,
            "subgenre-session".into(),
            run_id,
            &root.join("aliases.json"),
        )
        .unwrap();
        assert_eq!(fs::read(&file).unwrap(), original);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maest_subgenre_noop_has_no_backup_or_history() {
        let (root, file, state, genre_request, _, _) =
            maest_genre_fixture("subgenre-noop", "noop.flac");
        write_subgenre_only(&file, "Deep House").unwrap();
        let metadata = fs::metadata(&file).unwrap();
        {
            let mut session = state.scan_session.lock().unwrap();
            let session = session.as_mut().unwrap();
            let updated = update_session_track_after_write(
                session,
                &genre_request.scan_id,
                read_audio_metadata(&file).unwrap(),
                metadata.len(),
            )
            .unwrap();
            session
                .file_versions
                .insert(updated.relative_path, file_version(&metadata));
        }
        let request = MaestSubgenreWriteRequest {
            session_id: genre_request.session_id,
            scan_id: genre_request.scan_id,
            subgenre: "Deep House".into(),
        };
        assert!(
            !preview_maest_subgenre_write_state(&state, &request)
                .unwrap()
                .changed
        );
        assert!(state.metadata_write_history.lock().unwrap().is_empty());
        assert!(!root.join(super::METADATA_BACKUP_DIRECTORY).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maest_subgenre_blocks_external_changes_and_unsupported_formats() {
        let (root, file, state, genre_request, _, _) =
            maest_genre_fixture("subgenre-changed", "changed.flac");
        let request = MaestSubgenreWriteRequest {
            session_id: genre_request.session_id,
            scan_id: genre_request.scan_id,
            subgenre: "Deep House".into(),
        };
        preview_maest_subgenre_write_state(&state, &request).unwrap();
        fs::OpenOptions::new()
            .append(true)
            .open(&file)
            .unwrap()
            .write_all(b"x")
            .unwrap();
        assert_eq!(
            apply_maest_subgenre_write_state(&state, request, &root.join("aliases.json"))
                .unwrap_err()
                .code,
            "track_changed"
        );
        assert!(!subgenre_tag_is_writable(Path::new("track.wav")));
        assert!(!subgenre_tag_is_writable(Path::new("track.aiff")));
        assert!(!subgenre_tag_is_writable(Path::new("track.aac")));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maest_subgenre_verification_failure_restores_backup() {
        let (root, file, state, genre_request, _, original) =
            maest_genre_fixture("subgenre-rollback", "rollback.flac");
        let request = MaestSubgenreWriteRequest {
            session_id: genre_request.session_id,
            scan_id: genre_request.scan_id,
            subgenre: "Deep House".into(),
        };
        preview_maest_subgenre_write_state(&state, &request).unwrap();
        let error = apply_maest_genre_write_state_with(
            &state,
            MaestGenreWriteRequest {
                session_id: request.session_id,
                scan_id: request.scan_id,
                genre: request.subgenre,
            },
            &root.join("aliases.json"),
            "subgenre",
            |path, subgenre| {
                write_subgenre_only(path, subgenre).unwrap();
                Err("verification_failed")
            },
            persist_local_aliases,
        )
        .unwrap_err();
        assert_eq!(error.code, "verification_failed");
        assert_eq!(fs::read(&file).unwrap(), original);
        assert!(state.metadata_write_history.lock().unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maest_genre_apply_requires_and_consumes_the_matching_preview() {
        let (root, file, state, request, original, _) =
            maest_genre_fixture("genre-session", "genre-only.flac");
        let missing =
            apply_maest_genre_write_state(&state, request.clone(), &root.join("aliases.json"))
                .unwrap_err();
        assert_eq!(missing.code, "preview_required");

        preview_maest_genre_write_state(&state, &request).unwrap();
        let wrong_genre = MaestGenreWriteRequest {
            genre: "Techno".into(),
            ..request.clone()
        };
        assert_eq!(
            apply_maest_genre_write_state(&state, wrong_genre, &root.join("aliases.json"))
                .unwrap_err()
                .code,
            "preview_required"
        );
        let wrong_scan = MaestGenreWriteRequest {
            scan_id: "another-scan".into(),
            ..request.clone()
        };
        assert_eq!(
            apply_maest_genre_write_state(&state, wrong_scan, &root.join("aliases.json"))
                .unwrap_err()
                .code,
            "preview_required"
        );
        let wrong_session = MaestGenreWriteRequest {
            session_id: "another-session".into(),
            ..request.clone()
        };
        assert_eq!(
            apply_maest_genre_write_state(&state, wrong_session, &root.join("aliases.json"))
                .unwrap_err()
                .code,
            "scan_session_unavailable"
        );

        let result =
            apply_maest_genre_write_state(&state, request.clone(), &root.join("aliases.json"))
                .unwrap();
        let run_id = result.run_id.clone().unwrap();
        assert_eq!(result.applied_files, 1);
        let public_result = serde_json::to_string(&result).unwrap();
        assert!(!public_result.contains("path"));
        assert!(!public_result.contains("fingerprint"));
        assert!(!public_result.contains("identity"));
        assert_eq!(
            apply_maest_genre_write_state(&state, request.clone(), &root.join("aliases.json"))
                .unwrap_err()
                .code,
            "preview_required"
        );
        let after = read_audio_metadata(&file).unwrap();
        assert_eq!(after.genre.as_deref(), Some("Electronic"));
        assert_eq!(after.title, original.title);
        assert_eq!(after.artist, original.artist);
        assert_eq!(after.album, original.album);
        assert_eq!(after.bpm, original.bpm);
        assert_eq!(after.musical_key, original.musical_key);
        let history = state.metadata_write_history.lock().unwrap();
        let run = history.iter().find(|run| run.id == run_id).unwrap();
        assert!(run.backups[0].backup_path.exists());
        assert!(!run.backups[0].backup_path.to_string_lossy().is_empty());
        drop(history);
        let session = state.scan_session.lock().unwrap();
        let track = &session.as_ref().unwrap().tracks[&request.scan_id];
        assert_eq!(track.track.genre.as_deref(), Some("Electronic"));
        assert_eq!(
            session.as_ref().unwrap().file_versions[&track.track.relative_path],
            file_version(&fs::metadata(&file).unwrap())
        );
        drop(session);
        let alias_store = read_local_alias_store(&root.join("aliases.json"));
        let record = &alias_store.tracks[TEST_LIBRARY_TRACK_ID];
        assert_eq!(record.aliases.len(), 1);
        assert_ne!(
            record.anchor.fingerprint,
            fingerprint_text(hash_file(&file, fs::metadata(&file).unwrap().len()).unwrap())
        );
        let persisted = serde_json::to_string(&alias_store).unwrap();
        assert!(!persisted.contains("genre-only"));
        assert!(!persisted.contains("Electronic"));
        assert!(!persisted.contains("genre-session"));

        let restarted = scan_music_folder(&root, "restart-session".into()).unwrap();
        let candidates = vec![LibraryLinkCandidate {
            file_fingerprint: record.anchor.fingerprint.clone(),
            file_size: record.anchor.size,
            track_id: TEST_LIBRARY_TRACK_ID.into(),
        }];
        let relinked = link_library_candidates_with_aliases(
            &restarted.session_tracks,
            &candidates,
            &alias_store,
        )
        .unwrap();
        assert!(relinked.links.contains_key(TEST_LIBRARY_TRACK_ID));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maest_genre_receipt_rejects_file_and_snapshot_changes() {
        let (root, file, state, request, _, _) =
            maest_genre_fixture("genre-session", "changed.flac");
        preview_maest_genre_write_state(&state, &request).unwrap();
        let mut bytes = fs::read(&file).unwrap();
        bytes.push(0);
        fs::write(&file, bytes).unwrap();
        assert_eq!(
            apply_maest_genre_write_state(&state, request.clone(), &root.join("aliases.json"))
                .unwrap_err()
                .code,
            "track_changed"
        );
        assert!(!root.join(super::METADATA_BACKUP_DIRECTORY).exists());
        fs::remove_dir_all(&root).unwrap();

        let (root, _, state, request, _, _) =
            maest_genre_fixture("genre-session-2", "internal.flac");
        preview_maest_genre_write_state(&state, &request).unwrap();
        {
            let mut guard = state.scan_session.lock().unwrap();
            let session = guard.as_mut().unwrap();
            let track = session.tracks[&request.scan_id].track.clone();
            let metadata_request = MetadataWriteRequest {
                session_id: request.session_id.clone(),
                edits: vec![MetadataEditInput {
                    title: "Changed internally".into(),
                    artist: track.artist.unwrap_or_default(),
                    album: track.album.unwrap_or_default(),
                    genre: track.genre.unwrap_or_default(),
                    bpm: track.bpm,
                    musical_key: track.musical_key.unwrap_or_default(),
                    scan_id: request.scan_id.clone(),
                }],
            };
            apply_metadata_write_batch(session, &metadata_request).unwrap();
        }
        assert_eq!(
            apply_maest_genre_write_state(&state, request, &root.join("aliases.json"))
                .unwrap_err()
                .code,
            "track_changed"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maest_genre_receipt_rejects_same_size_mtime_replacement() {
        let (root, file, state, request, _, original_bytes) =
            maest_genre_fixture("replacement-session", "replacement.flac");
        preview_maest_genre_write_state(&state, &request).unwrap();
        let modified = fs::metadata(&file).unwrap().modified().unwrap();
        let replacement = root.join("new.flac");
        let mut replacement_bytes = original_bytes;
        let last = replacement_bytes.len() - 1;
        replacement_bytes[last] ^= 1;
        fs::write(&replacement, replacement_bytes).unwrap();
        let replacement_file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(&replacement)
            .unwrap();
        replacement_file
            .set_times(fs::FileTimes::new().set_modified(modified))
            .unwrap();
        drop(replacement_file);
        fs::rename(&file, root.join("old.flac")).unwrap();
        fs::rename(&replacement, &file).unwrap();
        assert_eq!(
            apply_maest_genre_write_state(&state, request, &root.join("aliases.json"))
                .unwrap_err()
                .code,
            "track_changed"
        );
        assert!(!root.join(super::METADATA_BACKUP_DIRECTORY).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maest_genre_noop_has_no_receipt_or_backup() {
        let (root, _, state, mut request, _, _) = maest_genre_fixture("noop-session", "noop.flac");
        request.genre = " House ".into();
        let preview = preview_maest_genre_write_state(&state, &request).unwrap();
        assert!(!preview.changed);
        assert!(state
            .pending_maest_genre_previews
            .lock()
            .unwrap()
            .is_empty());
        assert_eq!(
            apply_maest_genre_write_state(&state, request, &root.join("aliases.json"))
                .unwrap_err()
                .code,
            "preview_required"
        );
        assert!(!root.join(super::METADATA_BACKUP_DIRECTORY).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maest_genre_failure_after_modification_restores_backup() {
        let (root, file, state, request, _, original_bytes) =
            maest_genre_fixture("rollback-session", "rollback.flac");
        preview_maest_genre_write_state(&state, &request).unwrap();
        let error = apply_maest_genre_write_state_with(
            &state,
            request,
            &root.join("aliases.json"),
            "genre",
            |path, genre| {
                write_genre_only(path, genre).unwrap();
                Err("verification_failed")
            },
            persist_local_aliases,
        )
        .unwrap_err();
        assert_eq!(error.code, "verification_failed");
        assert_eq!(fs::read(file).unwrap(), original_bytes);
        assert!(state.metadata_write_history.lock().unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maest_genre_real_undo_restores_and_blocks_external_changes() {
        let (root, file, state, request, _, original_bytes) =
            maest_genre_fixture("undo-session", "undo.flac");
        preview_maest_genre_write_state(&state, &request).unwrap();
        let run_id =
            apply_maest_genre_write_state(&state, request.clone(), &root.join("aliases.json"))
                .unwrap()
                .run_id
                .unwrap();
        undo_metadata_writes_state(
            &state,
            request.session_id.clone(),
            run_id,
            &root.join("aliases.json"),
        )
        .unwrap();
        assert_eq!(fs::read(&file).unwrap(), original_bytes);

        preview_maest_genre_write_state(&state, &request).unwrap();
        let run_id =
            apply_maest_genre_write_state(&state, request.clone(), &root.join("aliases.json"))
                .unwrap()
                .run_id
                .unwrap();
        fs::OpenOptions::new()
            .append(true)
            .open(&file)
            .unwrap()
            .write_all(&[0])
            .unwrap();
        assert!(undo_metadata_writes_state(
            &state,
            request.session_id,
            run_id,
            &root.join("aliases.json"),
        )
        .is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maest_genre_internal_helper_still_preserves_other_tags() {
        let (root, file, state, request, original, _) =
            maest_genre_fixture("helper-session", "helper.flac");
        let session = state.scan_session.lock().unwrap();
        let (preview, _, _) =
            confirmed_maest_genre_preview(session.as_ref().unwrap(), &request).unwrap();

        let after = write_genre_only(&file, &preview.after).unwrap();
        assert_eq!(after.genre.as_deref(), Some("Electronic"));
        assert_eq!(after.title, original.title);
        assert_eq!(after.artist, original.artist);
        assert_eq!(after.album, original.album);
        assert_eq!(after.bpm, original.bpm);
        assert_eq!(after.musical_key, original.musical_key);
        drop(session);
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    fn general_metadata_request(
        state: &DesktopState,
        request: &MaestGenreWriteRequest,
        title: &str,
    ) -> MetadataWriteRequest {
        let guard = state.scan_session.lock().unwrap();
        let track = guard.as_ref().unwrap().tracks[&request.scan_id]
            .track
            .clone();
        MetadataWriteRequest {
            session_id: request.session_id.clone(),
            edits: vec![MetadataEditInput {
                title: title.into(),
                artist: track.artist.unwrap_or_default(),
                album: track.album.unwrap_or_default(),
                genre: track.genre.unwrap_or_default(),
                bpm: track.bpm,
                musical_key: track.musical_key.unwrap_or_default(),
                scan_id: request.scan_id.clone(),
            }],
        }
    }

    #[test]
    fn local_alias_store_is_strict_bounded_and_anchor_scoped() {
        let root = test_directory();
        let path = root.join("aliases.json");
        fs::write(&path, b"{broken").unwrap();
        assert!(read_local_alias_store(&path).tracks.is_empty());

        let anchor = LocalFileIdentity {
            fingerprint: "1".repeat(64),
            size: 10,
        };
        let mut store = LocalLibraryFileAliases::default();
        store.tracks.insert(
            TEST_LIBRARY_TRACK_ID.into(),
            LocalTrackAliases {
                anchor: anchor.clone(),
                aliases: Vec::new(),
            },
        );
        for index in 0..12_u8 {
            register_local_alias(
                &mut store,
                TEST_LIBRARY_TRACK_ID,
                [index; 32],
                20 + index as u64,
            );
        }
        assert_eq!(store.tracks[TEST_LIBRARY_TRACK_ID].aliases.len(), 8);
        write_local_alias_store(&path, &store).unwrap();
        let serialized = fs::read_to_string(&path).unwrap();
        assert!(!serialized.contains("path"));
        assert!(!serialized.contains("session"));

        let file = root.join("alias.mp3");
        fs::write(&file, [11_u8; 3]).unwrap();
        let tracks = vec![SessionTrack {
            absolute_path: file,
            track: ScannedAudioFile {
                scan_id: "alias-scan".into(),
                name: "alias.mp3".into(),
                relative_path: "alias.mp3".into(),
                extension: "mp3".into(),
                size_bytes: 3,
                metadata_read: false,
                title: None,
                artist: None,
                album: None,
                genre: None,
                duration_seconds: None,
                bpm: None,
                musical_key: None,
                duplicate_group: None,
            },
        }];
        let alias_fingerprint = format!("{:x}", Sha256::digest([11_u8; 3]));
        store.tracks.get_mut(TEST_LIBRARY_TRACK_ID).unwrap().aliases = vec![LocalFileIdentity {
            fingerprint: alias_fingerprint,
            size: 3,
        }];
        let changed_anchor = vec![LibraryLinkCandidate {
            file_fingerprint: "2".repeat(64),
            file_size: 10,
            track_id: TEST_LIBRARY_TRACK_ID.into(),
        }];
        assert!(
            link_library_candidates_with_aliases(&tracks, &changed_anchor, &store)
                .unwrap()
                .links
                .is_empty()
        );
        let second_id = "22222222-2222-4222-8222-222222222222";
        let shared_aliases = store.tracks[TEST_LIBRARY_TRACK_ID].aliases.clone();
        store.tracks.insert(
            second_id.into(),
            LocalTrackAliases {
                anchor: LocalFileIdentity {
                    fingerprint: "3".repeat(64),
                    size: 10,
                },
                aliases: shared_aliases,
            },
        );
        let ambiguous = vec![
            LibraryLinkCandidate {
                file_fingerprint: anchor.fingerprint,
                file_size: anchor.size,
                track_id: TEST_LIBRARY_TRACK_ID.into(),
            },
            LibraryLinkCandidate {
                file_fingerprint: "3".repeat(64),
                file_size: 10,
                track_id: second_id.into(),
            },
        ];
        assert!(
            link_library_candidates_with_aliases(&tracks, &ambiguous, &store)
                .unwrap()
                .links
                .is_empty()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn general_metadata_write_registers_alias_only_for_linked_tracks() {
        let (root, _, state, request, _, _) =
            maest_genre_fixture("general-session", "general.flac");
        let alias_path = root.join("aliases.json");
        let before = read_local_alias_store(&alias_path).tracks[TEST_LIBRARY_TRACK_ID]
            .aliases
            .len();
        apply_metadata_writes_state(
            &state,
            general_metadata_request(&state, &request, "General write"),
            &alias_path,
        )
        .unwrap();
        assert_eq!(
            read_local_alias_store(&alias_path).tracks[TEST_LIBRARY_TRACK_ID]
                .aliases
                .len(),
            before + 1
        );

        state
            .scan_session
            .lock()
            .unwrap()
            .as_mut()
            .unwrap()
            .library_links
            .clear();
        let aliases_before_unlinked = read_local_alias_store(&alias_path).tracks
            [TEST_LIBRARY_TRACK_ID]
            .aliases
            .len();
        let unlinked_run = apply_metadata_writes_state(
            &state,
            general_metadata_request(&state, &request, "Unlinked write"),
            &alias_path,
        )
        .unwrap()
        .run_id
        .unwrap();
        assert_eq!(
            read_local_alias_store(&alias_path).tracks[TEST_LIBRARY_TRACK_ID]
                .aliases
                .len(),
            aliases_before_unlinked
        );
        undo_metadata_writes_state(
            &state,
            request.session_id.clone(),
            unlinked_run,
            &alias_path,
        )
        .unwrap();
        assert_eq!(
            read_local_alias_store(&alias_path).tracks[TEST_LIBRARY_TRACK_ID]
                .aliases
                .len(),
            aliases_before_unlinked
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn successive_writes_keep_bounded_history_and_undo_state_relinks() {
        let (root, _, state, request, _, _) =
            maest_genre_fixture("successive-session", "successive.flac");
        let alias_path = root.join("aliases.json");
        let mut runs = Vec::new();
        for index in 0..10 {
            runs.push(
                apply_metadata_writes_state(
                    &state,
                    general_metadata_request(&state, &request, &format!("Version {index}")),
                    &alias_path,
                )
                .unwrap()
                .run_id
                .unwrap(),
            );
        }
        assert_eq!(
            read_local_alias_store(&alias_path).tracks[TEST_LIBRARY_TRACK_ID]
                .aliases
                .len(),
            MAX_LIBRARY_FILE_ALIASES_PER_TRACK
        );
        let evicted_backup = {
            let history = state.metadata_write_history.lock().unwrap();
            history
                .iter()
                .find(|run| run.id == runs[2])
                .unwrap()
                .backups[0]
                .backup_path
                .clone()
        };
        let evicted_size = fs::metadata(&evicted_backup).unwrap().len();
        let evicted_identity = LocalFileIdentity {
            fingerprint: fingerprint_text(hash_file(&evicted_backup, evicted_size).unwrap()),
            size: evicted_size,
        };
        assert!(
            !read_local_alias_store(&alias_path).tracks[TEST_LIBRARY_TRACK_ID]
                .aliases
                .contains(&evicted_identity)
        );
        for run_id in runs.iter().skip(2).rev() {
            undo_metadata_writes_state(
                &state,
                request.session_id.clone(),
                run_id.clone(),
                &alias_path,
            )
            .unwrap();
        }
        let store = read_local_alias_store(&alias_path);
        assert_eq!(
            store.tracks[TEST_LIBRARY_TRACK_ID].aliases.len(),
            MAX_LIBRARY_FILE_ALIASES_PER_TRACK
        );
        assert!(store.tracks[TEST_LIBRARY_TRACK_ID]
            .aliases
            .contains(&evicted_identity));
        let session = state.scan_session.lock().unwrap();
        let current = &session.as_ref().unwrap().tracks[&request.scan_id];
        let candidates = vec![LibraryLinkCandidate {
            file_fingerprint: store.tracks[TEST_LIBRARY_TRACK_ID]
                .anchor
                .fingerprint
                .clone(),
            file_size: store.tracks[TEST_LIBRARY_TRACK_ID].anchor.size,
            track_id: TEST_LIBRARY_TRACK_ID.into(),
        }];
        assert!(link_library_candidates_with_aliases(
            std::slice::from_ref(current),
            &candidates,
            &store,
        )
        .unwrap()
        .links
        .contains_key(TEST_LIBRARY_TRACK_ID));
        drop(session);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn maest_alias_persistence_failure_rolls_back_or_reports_restore_failure() {
        let (root, file, state, request, _, original) =
            maest_genre_fixture("alias-failure", "alias-failure.flac");
        preview_maest_genre_write_state(&state, &request).unwrap();
        let error = apply_maest_genre_write_state_with(
            &state,
            request,
            &root.join("aliases.json"),
            "genre",
            write_genre_only,
            |_, _| Err(()),
        )
        .unwrap_err();
        assert_eq!(error.code, "link_state_failed");
        assert_eq!(fs::read(&file).unwrap(), original);
        assert!(state.metadata_write_history.lock().unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();

        let (root, file, state, request, _, _) =
            maest_genre_fixture("restore-failure", "restore-failure.flac");
        preview_maest_genre_write_state(&state, &request).unwrap();
        let sabotaged = file.clone();
        let error = apply_maest_genre_write_state_with(
            &state,
            request,
            &root.join("aliases.json"),
            "genre",
            write_genre_only,
            move |_, _| {
                fs::remove_file(&sabotaged).unwrap();
                fs::create_dir(&sabotaged).unwrap();
                Err(())
            },
        )
        .unwrap_err();
        assert_eq!(error.code, "restore_failed");
        assert!(state.metadata_write_history.lock().unwrap().is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn undo_alias_persistence_failure_restores_pre_undo_state_and_history() {
        let (root, file, state, request, _, _) =
            maest_genre_fixture("undo-alias-failure", "undo-alias-failure.flac");
        let alias_path = root.join("aliases.json");
        preview_maest_genre_write_state(&state, &request).unwrap();
        let run_id = apply_maest_genre_write_state(&state, request.clone(), &alias_path)
            .unwrap()
            .run_id
            .unwrap();
        let pre_undo = fs::read(&file).unwrap();
        let error = undo_metadata_writes_state_with(
            &state,
            request.session_id.clone(),
            run_id.clone(),
            &alias_path,
            |_, _| Err(()),
        )
        .unwrap_err();
        assert_eq!(error.code, "link_state_failed");
        assert_eq!(fs::read(&file).unwrap(), pre_undo);
        assert!(
            !state
                .metadata_write_history
                .lock()
                .unwrap()
                .iter()
                .find(|run| run.id == run_id)
                .unwrap()
                .undone
        );
        fs::remove_dir_all(root).unwrap();

        let (root, _, state, request, _, _) =
            maest_genre_fixture("undo-restore-failure", "undo-restore-failure.flac");
        let alias_path = root.join("aliases.json");
        preview_maest_genre_write_state(&state, &request).unwrap();
        let run_id = apply_maest_genre_write_state(&state, request.clone(), &alias_path)
            .unwrap()
            .run_id
            .unwrap();
        let undo_current = root
            .join(super::METADATA_BACKUP_DIRECTORY)
            .join(&run_id)
            .join("undo-current")
            .join(&request.scan_id);
        let error = undo_metadata_writes_state_with(
            &state,
            request.session_id,
            run_id.clone(),
            &alias_path,
            move |_, _| {
                fs::remove_file(&undo_current).unwrap();
                Err(())
            },
        )
        .unwrap_err();
        assert_eq!(error.code, "restore_failed");
        assert!(
            !state
                .metadata_write_history
                .lock()
                .unwrap()
                .iter()
                .find(|run| run.id == run_id)
                .unwrap()
                .undone
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn keeps_files_when_embedded_metadata_cannot_be_read() {
        let root = test_directory();
        let set = root.join("Set A");
        fs::create_dir_all(&set).expect("nested directory should be created");
        fs::write(set.join("Opening.MP3"), [1_u8, 2, 3]).expect("audio fixture should be written");
        fs::write(root.join("notes.txt"), b"not audio").expect("text fixture should be written");

        let result = scan_music_folder(&root, "test-session".to_owned())
            .expect("folder should be scanned")
            .result;

        assert_eq!(result.tracks.len(), 1);
        assert_eq!(result.tracks[0].name, "Opening.MP3");
        assert_eq!(result.tracks[0].relative_path, "Set A/Opening.MP3");
        assert_eq!(result.tracks[0].extension, "mp3");
        assert_eq!(result.tracks[0].size_bytes, 3);
        assert!(!result.tracks[0].metadata_read);
        assert_eq!(result.metadata_failures, 1);
        assert_eq!(result.duplicate_groups, 0);
        assert_eq!(result.duplicate_tracks, 0);
        assert!(!result.truncated);

        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn incremental_scan_preserves_ids_and_reconciles_folder_changes() {
        let root = test_directory();
        for name in ["Changed.wav", "Removed.wav", "Unchanged.wav"] {
            fs::write(root.join(name), one_second_wav()).expect("WAV fixture should be written");
        }
        let initial = scan_music_folder(&root, "incremental-session".to_owned())
            .expect("initial folder scan should succeed");
        let initial_tracks = initial
            .session_tracks
            .into_iter()
            .map(|track| (track.track.scan_id.clone(), track))
            .collect::<HashMap<_, _>>();
        let initial_by_path = initial_tracks
            .values()
            .map(|track| {
                (
                    track.track.relative_path.clone(),
                    track.track.scan_id.clone(),
                )
            })
            .collect::<HashMap<_, _>>();
        fs::remove_file(root.join("Removed.wav")).expect("removed fixture should be deleted");
        let mut changed = one_second_wav();
        changed.push(0);
        fs::write(root.join("Changed.wav"), changed).expect("changed fixture should be replaced");
        fs::write(root.join("Added.wav"), one_second_wav())
            .expect("added fixture should be written");

        let incremental = scan_music_folder_with_previous(
            &root,
            "incremental-session".to_owned(),
            Some(&initial_tracks),
            Some(&initial.file_versions),
        )
        .expect("incremental scan should succeed");
        let incremental_by_path = incremental
            .result
            .tracks
            .iter()
            .map(|track| (track.relative_path.clone(), track.scan_id.clone()))
            .collect::<HashMap<_, _>>();

        assert_eq!(incremental.result.tracks.len(), 3);
        assert!(!incremental_by_path.contains_key("Removed.wav"));
        assert!(incremental_by_path.contains_key("Added.wav"));
        assert_eq!(
            incremental_by_path.get("Changed.wav"),
            initial_by_path.get("Changed.wav")
        );
        assert_eq!(
            incremental_by_path.get("Unchanged.wav"),
            initial_by_path.get("Unchanged.wav")
        );
        assert_eq!(
            count_incremental_changes(&initial.file_versions, &incremental.file_versions),
            (1, 1, 1, 1)
        );
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn identifies_only_exact_local_duplicates() {
        let root = test_directory();
        let nested = root.join("Nested");
        fs::create_dir_all(&nested).expect("nested directory should be created");
        fs::write(root.join("First.mp3"), [1_u8, 2, 3]).expect("first fixture should be written");
        fs::write(nested.join("Copy.mp3"), [1_u8, 2, 3]).expect("copy fixture should be written");
        fs::write(root.join("Different.mp3"), [1_u8, 2, 4])
            .expect("different fixture should be written");

        let result = scan_music_folder(&root, "test-session".to_owned())
            .expect("folder should be scanned")
            .result;
        let duplicate_labels: Vec<_> = result
            .tracks
            .iter()
            .filter_map(|track| track.duplicate_group.as_deref())
            .collect();

        assert_eq!(result.duplicate_groups, 1);
        assert_eq!(result.duplicate_tracks, 2);
        assert_eq!(result.fingerprint_failures, 0);
        assert_eq!(duplicate_labels, vec!["DUP-001", "DUP-001"]);
        assert!(result
            .tracks
            .iter()
            .find(|track| track.name == "Different.mp3")
            .is_some_and(|track| track.duplicate_group.is_none()));

        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn links_library_tracks_by_size_and_exact_fingerprint() {
        let root = test_directory();
        let local_file = root.join("Matched.mp3");
        fs::write(&local_file, [1_u8, 2, 3]).expect("audio fixture should be written");
        let fingerprint = format!("{:x}", Sha256::digest([1_u8, 2, 3]));
        let tracks = vec![SessionTrack {
            absolute_path: local_file,
            track: ScannedAudioFile {
                scan_id: "opaque-scan-id".to_owned(),
                name: "Matched.mp3".to_owned(),
                relative_path: "Matched.mp3".to_owned(),
                extension: "mp3".to_owned(),
                size_bytes: 3,
                metadata_read: false,
                title: None,
                artist: None,
                album: None,
                genre: None,
                duration_seconds: None,
                bpm: None,
                musical_key: None,
                duplicate_group: None,
            },
        }];
        let candidates = vec![
            LibraryLinkCandidate {
                file_fingerprint: fingerprint,
                file_size: 3,
                track_id: "library-track".to_owned(),
            },
            LibraryLinkCandidate {
                file_fingerprint: "0".repeat(64),
                file_size: 3,
                track_id: "missing-track".to_owned(),
            },
        ];

        let result = link_library_candidates(&tracks, &candidates).expect("linking should succeed");

        assert_eq!(
            result.links.get("library-track"),
            Some(&"opaque-scan-id".to_owned())
        );
        assert_eq!(result.links.get("missing-track"), None);
        assert_eq!(result.unmatched_tracks, 1);
        assert_eq!(result.fingerprint_failures, 0);
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn creates_distinct_opaque_track_ids_within_a_session() {
        let first = create_track_path_id("session", "Opening.wav");
        let second = create_track_path_id("session", "Closing.wav");

        assert_eq!(first.len(), 64);
        assert_ne!(first, second);
        assert!(!first.contains("session"));
    }

    #[test]
    fn rejects_a_file_as_the_scan_root() {
        let root = test_directory();
        let file = root.join("track.wav");
        fs::write(&file, [0_u8]).expect("fixture should be written");

        let error = scan_music_folder(&file, "test-session".to_owned())
            .expect_err("a file is not a valid scan root");

        assert!(error.contains("carpeta"));
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn builds_ordered_virtualdj_xml_and_escapes_metadata() {
        let tracks = vec![
            SessionTrack {
                absolute_path: "/music/A&B/Opening \"Live\".mp3".into(),
                track: ScannedAudioFile {
                    scan_id: String::new(),
                    name: "Opening.mp3".to_owned(),
                    relative_path: "A/Opening.mp3".to_owned(),
                    extension: "mp3".to_owned(),
                    size_bytes: 42,
                    metadata_read: true,
                    title: Some("Opening <Live>".to_owned()),
                    artist: Some("DJ & Co.".to_owned()),
                    album: None,
                    genre: None,
                    duration_seconds: Some(180.5),
                    bpm: Some(124.0),
                    musical_key: Some("Am".to_owned()),
                    duplicate_group: None,
                },
            },
            SessionTrack {
                absolute_path: "/music/Closing.flac".into(),
                track: ScannedAudioFile {
                    scan_id: String::new(),
                    name: "Closing.flac".to_owned(),
                    relative_path: "Closing.flac".to_owned(),
                    extension: "flac".to_owned(),
                    size_bytes: 84,
                    metadata_read: false,
                    title: None,
                    artist: None,
                    album: None,
                    genre: None,
                    duration_seconds: None,
                    bpm: None,
                    musical_key: None,
                    duplicate_group: None,
                },
            },
        ];

        let xml = build_virtualdj_list_xml(&tracks).expect("XML should be generated");

        assert!(xml.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(
            xml.contains("<VirtualFolder noDuplicates=\"yes\" singleDrive=\"no\" ordered=\"yes\">")
        );
        assert!(xml.contains("path=\"/music/A&amp;B/Opening &quot;Live&quot;.mp3\""));
        assert!(xml.contains("title=\"Opening &lt;Live&gt;\""));
        assert!(xml.contains("artist=\"DJ &amp; Co.\""));
        assert_eq!(super::xml_escape_attribute("safe\u{1}value"), "safe�value");
        assert!(xml.contains("songlength=\"180.500\" bpm=\"124.000\" key=\"Am\" idx=\"0\""));
        assert!(xml.find("Opening").unwrap() < xml.find("Closing").unwrap());
        assert!(xml.ends_with("</VirtualFolder>\n"));

        let m3u8 = build_virtualdj_m3u8(&tracks).expect("M3U8 should be generated");
        assert!(m3u8.starts_with("#EXTM3U\n"));
        assert!(m3u8.contains("#EXTINF:181,DJ & Co. - Opening <Live>\n"));
        assert!(m3u8.contains("/music/A&B/Opening \"Live\".mp3\n"));
        assert!(m3u8.find("Opening").unwrap() < m3u8.find("Closing").unwrap());

        let mut incompatible = tracks[0].clone();
        incompatible.absolute_path = "/music/line\nbreak.mp3".into();
        assert!(build_virtualdj_m3u8(&[incompatible])
            .expect_err("line breaks in paths must be rejected")
            .contains("XML"));
    }

    #[test]
    fn builds_rekordbox_xml_with_escaped_file_uris_and_stable_track_ids() {
        assert_eq!(
            rekordbox_file_uri(Path::new(r"C:\Music\Café #1%.mp3")).expect("URI"),
            "file://localhost/C:/Music/Caf%C3%A9%20%231%25.mp3"
        );
        assert!(rekordbox_file_uri(Path::new("relative.mp3")).is_err());
        let track = SessionTrack {
            absolute_path: "/music/A&B.mp3".into(),
            track: ScannedAudioFile {
                scan_id: "scan-a".to_owned(),
                name: "A&B.mp3".to_owned(),
                relative_path: "A&B.mp3".to_owned(),
                extension: "mp3".to_owned(),
                size_bytes: 1,
                metadata_read: true,
                title: Some("A & B".to_owned()),
                artist: None,
                album: None,
                genre: None,
                duration_seconds: None,
                bpm: None,
                musical_key: None,
                duplicate_group: None,
            },
        };
        let xml = build_rekordbox_xml(&[(
            RekordboxCrateInput {
                hierarchy: vec![],
                id: "crate".to_owned(),
                name: "Warm up".to_owned(),
                track_ids: vec!["library".to_owned()],
            },
            vec![track],
        )])
        .expect("XML");
        assert!(xml.starts_with(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<DJ_PLAYLISTS Version=\"1.0.0\">"
        ));
        assert!(xml.contains("Location=\"file://localhost/music/A%26B.mp3\""));
        assert!(xml.contains("Name=\"A &amp; B\""));
        assert!(xml.contains("<TRACK Key=\"1\" />"));
    }

    #[test]
    fn publishes_rekordbox_xml_to_a_new_destination() {
        let root = test_directory();
        let destination = root.join("export.xml");

        write_rekordbox_xml_no_clobber(&destination, b"<DJ_PLAYLISTS />", |_| Ok(()))
            .expect("a new destination should be published");

        assert_eq!(
            fs::read(&destination).expect("export should exist"),
            b"<DJ_PLAYLISTS />"
        );
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn refuses_to_replace_an_existing_rekordbox_xml() {
        let root = test_directory();
        let destination = root.join("export.xml");
        fs::write(&destination, b"existing XML").expect("fixture should be written");

        let error = write_rekordbox_xml_no_clobber(&destination, b"new XML", |_| Ok(()))
            .expect_err("an existing destination must not be replaced");

        assert_eq!(error, "destination_exists");
        assert_eq!(
            fs::read(&destination).expect("existing export should remain"),
            b"existing XML"
        );
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[test]
    fn refuses_a_destination_created_between_validation_and_publication() {
        let root = test_directory();
        let destination = root.join("export.xml");

        let error = write_rekordbox_xml_no_clobber(&destination, b"new XML", |_| {
            fs::write(&destination, b"concurrent XML")
                .map_err(|error| format!("could not create concurrent fixture: {error}"))
        })
        .expect_err("a concurrently-created destination must not be replaced");

        assert_eq!(error, "destination_exists");
        assert_eq!(
            fs::read(&destination).expect("concurrent export should remain"),
            b"concurrent XML"
        );
        assert!(
            fs::read_dir(&root)
                .expect("test directory should be readable")
                .all(|entry| !entry
                    .expect("entry should be readable")
                    .file_name()
                    .to_string_lossy()
                    .contains(".djorganizer-")),
            "the failed export temporary should be cleaned up"
        );
        fs::remove_dir_all(root).expect("test directory should be removed");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_non_utf8_export_paths() {
        use std::{ffi::OsString, os::unix::ffi::OsStringExt, path::PathBuf};

        let path = PathBuf::from(OsString::from_vec(vec![
            b'/', b'm', b'u', b's', b'i', b'c', b'/', 0xff, b'.', b'm', b'p', b'3',
        ]));

        assert!(export_path_text(&path)
            .expect_err("a lossy path must be rejected")
            .contains("UTF-8"));
    }

    #[test]
    fn sanitizes_default_virtualdj_file_names() {
        assert_eq!(
            safe_export_file_name("  Warm-up: Friday / 01  "),
            "Warm-up Friday 01"
        );
        assert_eq!(safe_export_file_name("..."), "DJOrganizer");
        assert!(!safe_export_file_name(&format!("{}.", "a".repeat(80))).ends_with('.'));
    }

    #[test]
    fn parses_virtualdj_paths_with_both_xml_quote_styles() {
        let xml = r#"<?xml version="1.0"?>
<VirtualFolder ordered="yes">
  <song path="C:\Music\A &amp; B.mp3" idx="0" />
  <song path='C:\Music\Closing.wav' idx='1' />
</VirtualFolder>"#;

        assert_eq!(
            parse_virtualdj_paths(xml).expect("VirtualDJ paths should parse"),
            vec![
                r"C:\Music\A & B.mp3".to_owned(),
                r"C:\Music\Closing.wav".to_owned()
            ]
        );
    }

    #[test]
    fn reorganization_targets_stay_inside_the_confirmed_root() {
        let root = test_directory();
        let source = root.join("Unsafe.mp3");
        fs::write(&source, [1_u8, 2, 3]).expect("audio fixture should be written");
        let track = SessionTrack {
            absolute_path: source,
            track: ScannedAudioFile {
                scan_id: "scan-id".to_owned(),
                name: "Unsafe.mp3".to_owned(),
                relative_path: "Unsafe.mp3".to_owned(),
                extension: "mp3".to_owned(),
                size_bytes: 3,
                metadata_read: true,
                title: Some("../Opening".to_owned()),
                artist: Some("../CON".to_owned()),
                album: Some("Warm-up".to_owned()),
                genre: None,
                duration_seconds: None,
                bpm: None,
                musical_key: None,
                duplicate_group: None,
            },
        };
        let session = ScanSession {
            file_versions: HashMap::new(),
            id: "session".to_owned(),
            incremental_scan_active: false,
            root: root.clone(),
            tracks: HashMap::from([("scan-id".to_owned(), track)]),
            truncated: false,
            library_links: HashMap::new(),
        };

        let plan = build_reorganization_plan(
            &session,
            &["scan-id".to_owned()],
            &OrganizationScheme::ArtistAlbum,
        )
        .expect("the reorganization plan should be safe");

        assert_eq!(plan.len(), 1);
        assert!(plan[0].target.starts_with(&root));
        assert_eq!(safe_path_segment(Some("../CON"), "fallback"), "_CON");
        fs::remove_dir_all(root).expect("test directory should be removed");
    }
}
