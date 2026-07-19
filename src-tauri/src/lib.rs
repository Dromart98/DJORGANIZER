use lofty::{
    config::ParseOptions,
    file::{AudioFile, TaggedFileExt},
    mp4::{AtomData, AtomIdent, Ilst, Mp4File},
    read_from_path,
    tag::{Accessor, ItemKey},
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    fs,
    io::{BufReader, Read},
    path::{Path, PathBuf},
};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const AUDIO_EXTENSIONS: &[&str] = &[
    "aac", "aif", "aiff", "alac", "flac", "m4a", "mp3", "ogg", "opus", "wav",
];
const MAX_ENTRIES: usize = 100_000;
const MAX_TRACKS: usize = 10_000;

#[derive(Debug, Default, PartialEq)]
struct AudioMetadata {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    genre: Option<String>,
    duration_seconds: Option<f64>,
    bpm: Option<f64>,
    musical_key: Option<String>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedAudioFile {
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

fn scan_music_folder(root: &Path) -> Result<FolderScanResult, String> {
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
            });
        }
    }

    candidates.sort_by_key(|candidate| candidate.track.relative_path.to_ascii_lowercase());
    let (duplicate_groups, duplicate_tracks, fingerprint_failures) =
        mark_exact_duplicates(&mut candidates);
    let tracks = candidates
        .into_iter()
        .map(|candidate| candidate.track)
        .collect();

    Ok(FolderScanResult {
        root_name,
        tracks,
        examined_entries,
        skipped_entries,
        metadata_failures,
        duplicate_groups,
        duplicate_tracks,
        fingerprint_failures,
        truncated,
    })
}

#[tauri::command]
async fn choose_and_scan_music_folder(app: AppHandle) -> Result<Option<FolderScanResult>, String> {
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

    let scan = tauri::async_runtime::spawn_blocking(move || scan_music_folder(&root))
        .await
        .map_err(|error| format!("El escaneo local se interrumpió: {error}"))??;

    Ok(Some(scan))
}

/// Starts the desktop application.
///
/// The sole native command always opens an operating-system folder picker and
/// then performs a bounded, read-only scan. It reads file metadata and embedded
/// tags and compares exact-content fingerprints only for same-size candidates. It
/// never accepts a path supplied by remote web content and never writes, moves,
/// renames, uploads, returns fingerprints, or persists files.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![choose_and_scan_music_folder])
        .run(tauri::generate_context!())
        .expect("failed to run DJOrganizer desktop");
}

#[cfg(test)]
mod tests {
    use super::{
        audio_extension, parse_bpm, parse_mp4_bpm_value, read_audio_metadata, scan_music_folder,
    };
    use lofty::mp4::AtomData;
    use std::{
        fs,
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
    fn keeps_files_when_embedded_metadata_cannot_be_read() {
        let root = test_directory();
        let set = root.join("Set A");
        fs::create_dir_all(&set).expect("nested directory should be created");
        fs::write(set.join("Opening.MP3"), [1_u8, 2, 3]).expect("audio fixture should be written");
        fs::write(root.join("notes.txt"), b"not audio").expect("text fixture should be written");

        let result = scan_music_folder(&root).expect("folder should be scanned");

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
    fn identifies_only_exact_local_duplicates() {
        let root = test_directory();
        let nested = root.join("Nested");
        fs::create_dir_all(&nested).expect("nested directory should be created");
        fs::write(root.join("First.mp3"), [1_u8, 2, 3]).expect("first fixture should be written");
        fs::write(nested.join("Copy.mp3"), [1_u8, 2, 3]).expect("copy fixture should be written");
        fs::write(root.join("Different.mp3"), [1_u8, 2, 4])
            .expect("different fixture should be written");

        let result = scan_music_folder(&root).expect("folder should be scanned");
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
    fn rejects_a_file_as_the_scan_root() {
        let root = test_directory();
        let file = root.join("track.wav");
        fs::write(&file, [0_u8]).expect("fixture should be written");

        let error = scan_music_folder(&file).expect_err("a file is not a valid scan root");

        assert!(error.contains("carpeta"));
        fs::remove_dir_all(root).expect("test directory should be removed");
    }
}
