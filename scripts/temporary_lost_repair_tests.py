from pathlib import Path

path = Path("src-tauri/src/lost_track_repair.rs")
text = path.read_text(encoding="utf-8")
start = text.index("#[cfg(test)]\nmod tests {")
replacement = r'''#[cfg(test)]
mod tests {
    use super::*;
    use crate::ScannedAudioFile;
    use std::{collections::HashMap, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

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
'''
path.write_text(text[:start] + replacement, encoding="utf-8")
