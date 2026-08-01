//! Fail-closed acquisition and execution boundary for the official desktop MAEST model.

use futures_util::StreamExt;
use ndarray::Array3;
use ort::{session::Session, tensor::TensorElementType};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{BufReader, Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Manager, State};

pub const ANALYZER_ID: &str = "djorganizer.desktop.genre.maest";
pub const ANALYZER_VERSION: &str = "discogs-maest-30s-pw-519l@2";
pub const COMPATIBILITY_KEY: &str = "maest-519l|mel-16000-1876x96-f32|v2";
pub const CLASS_COUNT: usize = 519;
pub const INPUT_FRAMES: usize = 1876;
pub const INPUT_BANDS: usize = 96;
pub const SAMPLE_RATE: u32 = 16_000;

pub const MODEL: ModelManifest = ModelManifest {
    model_id: "discogs-maest-30s-pw-519l",
    version: 2,
    filename: "discogs-maest-30s-pw-519l-2.onnx",
    url:
        "https://essentia.upf.edu/models/feature-extractors/maest/discogs-maest-30s-pw-519l-2.onnx",
    bytes: 348_052_337,
    sha256: "c90a51a752cdd94f37de886787d5e3a5b2071c6d0ef49ea788058f65f11883b1",
    input_name: "melspectrogram",
    input_shape: [1, 1876, 96],
    output_name: "activations",
    output_shape: [1, 519],
    sample_rate: 16_000,
};
const MAX_DOWNLOAD_BYTES: u64 = MODEL.bytes + 1;
const RAW_CATALOG: &str = include_str!("../resources/maest-discogs519-v2.json");

#[derive(Debug, Deserialize)]
struct DiscogsCatalog {
    classes: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ModelManifest {
    pub model_id: &'static str,
    pub version: u32,
    pub filename: &'static str,
    pub url: &'static str,
    pub bytes: u64,
    pub sha256: &'static str,
    pub input_name: &'static str,
    pub input_shape: [usize; 3],
    pub output_name: &'static str,
    pub output_shape: [usize; 2],
    pub sample_rate: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedLabel {
    pub genre: String,
    pub subgenre: String,
}
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisError {
    pub code: String,
    pub message: String,
}
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposedTextField {
    pub field: &'static str,
    pub status: &'static str,
    pub source: &'static str,
    pub proposed_value: Option<String>,
    pub score: Option<f32>,
    pub error: Option<AnalysisError>,
    pub analyzed_at: String,
}
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzerIdentity {
    pub id: &'static str,
    pub version: &'static str,
}
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MaestAnalysisResult {
    pub analyzer: AnalyzerIdentity,
    pub compatibility_key: &'static str,
    pub genre: ProposedTextField,
    pub subgenre: ProposedTextField,
    pub partial_errors: Vec<AnalysisError>,
}

#[derive(Debug, Default)]
pub struct MaestState {
    preparing: AtomicBool,
    inference: InferenceGate,
    session: Mutex<Option<Arc<Session>>>,
}

fn with_cloned_ready_value<T, R>(
    value: &Mutex<Option<Arc<T>>>,
    run: impl FnOnce(Arc<T>) -> R,
) -> Option<R> {
    let value = value.lock().ok()?.as_ref()?.clone();
    Some(run(value))
}

impl MaestState {
    pub(crate) fn with_ready_session<T>(
        &self,
        run: impl FnOnce(&Session, &InferenceGate) -> T,
    ) -> Option<T> {
        with_cloned_ready_value(&self.session, |session| {
            run(session.as_ref(), &self.inference)
        })
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareModelResult {
    pub model_id: &'static str,
    pub version: u32,
    pub ready: bool,
    pub reused: bool,
}

fn prepared_result_if_loaded<T>(
    session: &Mutex<Option<Arc<T>>>,
) -> Result<Option<PrepareModelResult>, AnalysisError> {
    let loaded = session
        .lock()
        .map_err(|_| {
            error(
                "model_state_error",
                "El estado del analizador no está disponible.",
            )
        })?
        .is_some();
    Ok(loaded.then_some(PrepareModelResult {
        model_id: MODEL.model_id,
        version: MODEL.version,
        ready: true,
        reused: true,
    }))
}

fn error(code: &str, message: &str) -> AnalysisError {
    AnalysisError {
        code: code.into(),
        message: message.into(),
    }
}

fn catalog_classes() -> Result<Vec<String>, AnalysisError> {
    let catalog: DiscogsCatalog = serde_json::from_str(RAW_CATALOG).map_err(|_| {
        error(
            "invalid_taxonomy_catalog",
            "El catálogo oficial de géneros no es válido.",
        )
    })?;
    if catalog.classes.len() != CLASS_COUNT {
        return Err(error(
            "invalid_taxonomy_catalog",
            "El catálogo oficial no contiene 519 clases.",
        ));
    }
    for label in &catalog.classes {
        parse_discogs_label(label)?;
    }
    Ok(catalog.classes)
}

pub fn resolve_discogs_class(index: usize) -> Result<ParsedLabel, AnalysisError> {
    let classes = catalog_classes()?;
    let label = classes.get(index).ok_or_else(|| {
        error(
            "invalid_taxonomy_index",
            "El modelo devolvió un índice de género fuera de rango.",
        )
    })?;
    parse_discogs_label(label)
}

pub fn parse_discogs_label(label: &str) -> Result<ParsedLabel, AnalysisError> {
    let mut parts = label.split("---");
    let genre = parts.next().unwrap_or_default();
    let subgenre = parts.next().unwrap_or_default();
    if genre.is_empty() || subgenre.is_empty() || parts.next().is_some() {
        return Err(error(
            "invalid_taxonomy_label",
            "La etiqueta oficial no tiene la estructura Discogs esperada.",
        ));
    }
    Ok(ParsedLabel {
        genre: genre.into(),
        subgenre: subgenre.into(),
    })
}

pub fn validate_output(scores: &[f32]) -> Result<usize, AnalysisError> {
    if scores.len() != CLASS_COUNT {
        return Err(error(
            "invalid_output_shape",
            "El modelo devolvió una salida incompatible.",
        ));
    }
    if scores.iter().any(|score| !score.is_finite()) {
        return Err(error(
            "invalid_output_value",
            "El modelo devolvió valores no finitos.",
        ));
    }
    let (first, remaining) = scores
        .split_first()
        .ok_or_else(|| error("empty_output", "El modelo no devolvió predicciones."))?;
    let mut winner = 0;
    let mut maximum = *first;
    let mut ambiguous = false;
    for (index, score) in remaining.iter().enumerate() {
        if *score > maximum {
            winner = index + 1;
            maximum = *score;
            ambiguous = false;
        } else if *score == maximum {
            ambiguous = true;
        }
    }
    if ambiguous {
        return Err(error(
            "ambiguous_output",
            "El modelo no distinguió una clase ganadora.",
        ));
    }
    Ok(winner)
}

#[derive(Debug, Default)]
pub struct InferenceGate(AtomicBool);
#[derive(Debug)]
pub struct InferencePermit<'a>(&'a AtomicBool);
impl InferenceGate {
    pub fn acquire(&self) -> Result<InferencePermit<'_>, AnalysisError> {
        self.0
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| InferencePermit(&self.0))
            .map_err(|_| error("analyzer_busy", "Ya hay un análisis MAEST en curso."))
    }
}
impl Drop for InferencePermit<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

struct PreparationPermit<'a>(&'a AtomicBool);
impl Drop for PreparationPermit<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
fn acquire_preparation(flag: &AtomicBool) -> Result<PreparationPermit<'_>, AnalysisError> {
    flag.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map(|_| PreparationPermit(flag))
        .map_err(|_| {
            error(
                "model_preparation_busy",
                "La preparación del analizador ya está en curso.",
            )
        })
}

fn verify_artifact(
    path: &Path,
    expected_bytes: u64,
    expected_sha256: &str,
) -> Result<bool, AnalysisError> {
    let metadata = match fs::metadata(path) {
        Ok(value) => value,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(_) => {
            return Err(error(
                "model_storage_error",
                "No se pudo comprobar el modelo.",
            ))
        }
    };
    if !metadata.is_file() || metadata.len() != expected_bytes {
        return Ok(false);
    }
    let file = File::open(path)
        .map_err(|_| error("model_storage_error", "No se pudo comprobar el modelo."))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut count = 0_u64;
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|_| error("model_storage_error", "No se pudo comprobar el modelo."))?;
        if read == 0 {
            break;
        }
        count += read as u64;
        if count > expected_bytes {
            return Ok(false);
        }
        hasher.update(&buffer[..read]);
    }
    Ok(count == expected_bytes && format!("{:x}", hasher.finalize()) == expected_sha256)
}

pub(crate) fn verify_model(path: &Path) -> Result<bool, AnalysisError> {
    verify_artifact(path, MODEL.bytes, MODEL.sha256)
}

fn validate_session(session: &Session) -> Result<(), AnalysisError> {
    if session.inputs.len() != 1 {
        return Err(error(
            "model_incompatible",
            "El modelo tiene entradas incompatibles.",
        ));
    }
    let input = &session.inputs[0];
    if input.name != MODEL.input_name
        || input.input_type.tensor_type() != Some(TensorElementType::Float32)
        || input.input_type.tensor_dimensions().map(Vec::as_slice) != Some(&[1, 1876, 96])
    {
        return Err(error(
            "model_incompatible",
            "La entrada del modelo no coincide con el contrato MAEST.",
        ));
    }
    let output = session
        .outputs
        .iter()
        .find(|output| output.name == MODEL.output_name)
        .ok_or_else(|| {
            error(
                "model_incompatible",
                "El modelo no contiene la salida de predicciones MAEST.",
            )
        })?;
    if output.output_type.tensor_type() != Some(TensorElementType::Float32)
        || output.output_type.tensor_dimensions().map(Vec::as_slice) != Some(&[1, 519])
    {
        return Err(error(
            "model_incompatible",
            "La salida del modelo no coincide con el contrato MAEST.",
        ));
    }
    Ok(())
}

pub(crate) fn load_session(path: &Path) -> Result<Session, AnalysisError> {
    let session = Session::builder()
        .and_then(|builder| builder.with_intra_threads(1))
        .and_then(|builder| builder.commit_from_file(path))
        .map_err(|_| error("model_runtime_error", "No se pudo cargar el analizador."))?;
    validate_session(&session)?;
    Ok(session)
}

fn validate_preprocessed_len(length: usize) -> Result<(), AnalysisError> {
    if length != INPUT_FRAMES * INPUT_BANDS {
        return Err(error(
            "invalid_input_shape",
            "El tensor no coincide con la entrada MAEST.",
        ));
    }
    Ok(())
}

pub fn run_preprocessed(session: &Session, values: Vec<f32>) -> Result<Vec<f32>, AnalysisError> {
    validate_preprocessed_len(values.len())?;
    let input = Array3::from_shape_vec((1, INPUT_FRAMES, INPUT_BANDS), values).map_err(|_| {
        error(
            "invalid_input_shape",
            "El tensor no coincide con la entrada MAEST.",
        )
    })?;
    let outputs = session
        .run(
            ort::inputs![MODEL.input_name => input]
                .map_err(|_| error("model_runtime_error", "No se pudo preparar la entrada."))?,
        )
        .map_err(|_| {
            error(
                "inference_failed",
                "El analizador no pudo completar la inferencia.",
            )
        })?;
    let output = outputs.get(MODEL.output_name).ok_or_else(|| {
        error(
            "invalid_output_shape",
            "El modelo no devolvió la salida esperada.",
        )
    })?;
    let tensor = output.try_extract_tensor::<f32>().map_err(|_| {
        error(
            "invalid_output_shape",
            "El modelo devolvió una salida incompatible.",
        )
    })?;
    if tensor.shape() != MODEL.output_shape {
        return Err(error(
            "invalid_output_shape",
            "El modelo devolvió una salida incompatible.",
        ));
    }
    let scores = tensor.iter().copied().collect::<Vec<_>>();
    validate_output(&scores)?;
    Ok(scores)
}

async fn download_model(target: &Path) -> Result<(), AnalysisError> {
    let temporary = target.with_extension("onnx.download");
    let _ = fs::remove_file(&temporary);
    let result = async {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(3))
            .connect_timeout(Duration::from_secs(20))
            .timeout(Duration::from_secs(900))
            .build()
            .map_err(|_| {
                error(
                    "download_configuration_error",
                    "No se pudo preparar la descarga.",
                )
            })?;
        let response = client
            .get(MODEL.url)
            .send()
            .await
            .map_err(|_| error("download_failed", "No se pudo descargar el analizador."))?
            .error_for_status()
            .map_err(|_| {
                error(
                    "download_http_error",
                    "El servidor oficial rechazó la descarga.",
                )
            })?;
        if response
            .content_length()
            .is_some_and(|length| length != MODEL.bytes)
        {
            return Err(error(
                "download_size_mismatch",
                "La descarga no tiene el tamaño esperado.",
            ));
        }
        let mut file = File::create(&temporary)
            .map_err(|_| error("model_storage_error", "No se pudo guardar el analizador."))?;
        let mut stream = response.bytes_stream();
        let mut count = 0_u64;
        let mut hasher = Sha256::new();
        while let Some(chunk) = stream.next().await {
            let chunk =
                chunk.map_err(|_| error("download_incomplete", "La descarga quedó incompleta."))?;
            count = count.checked_add(chunk.len() as u64).ok_or_else(|| {
                error(
                    "download_too_large",
                    "La descarga excede el límite permitido.",
                )
            })?;
            if count >= MAX_DOWNLOAD_BYTES {
                return Err(error(
                    "download_too_large",
                    "La descarga excede el límite permitido.",
                ));
            }
            file.write_all(&chunk)
                .map_err(|_| error("model_storage_error", "No se pudo guardar el analizador."))?;
            hasher.update(&chunk);
        }
        if count != MODEL.bytes {
            return Err(error(
                "download_incomplete",
                "La descarga quedó incompleta.",
            ));
        }
        if format!("{:x}", hasher.finalize()) != MODEL.sha256 {
            return Err(error(
                "download_hash_mismatch",
                "La integridad del analizador no es válida.",
            ));
        }
        file.sync_all()
            .map_err(|_| error("model_storage_error", "No se pudo confirmar el analizador."))?;
        drop(file);
        fs::rename(&temporary, target).map_err(|_| {
            error(
                "model_publish_error",
                "No se pudo publicar el analizador verificado.",
            )
        })?;
        Ok(())
    }
    .await;
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[tauri::command]
pub async fn prepare_maest_model(
    app: AppHandle,
    state: State<'_, MaestState>,
) -> Result<PrepareModelResult, AnalysisError> {
    if let Some(prepared) = prepared_result_if_loaded(&state.session)? {
        return Ok(prepared);
    }
    let _permit = acquire_preparation(&state.preparing)?;
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| {
            error(
                "model_storage_error",
                "No se pudo localizar el almacenamiento privado.",
            )
        })?
        .join("models")
        .join(MODEL.model_id)
        .join(MODEL.version.to_string());
    fs::create_dir_all(&directory).map_err(|_| {
        error(
            "model_storage_error",
            "No se pudo preparar el almacenamiento privado.",
        )
    })?;
    let target = directory.join(MODEL.filename);
    let reused = verify_model(&target)?;
    if !reused {
        let _ = fs::remove_file(&target);
        download_model(&target).await?;
        if !verify_model(&target)? {
            let _ = fs::remove_file(&target);
            return Err(error(
                "model_integrity_error",
                "El analizador descargado no superó la verificación.",
            ));
        }
    }
    if state
        .session
        .lock()
        .map_err(|_| {
            error(
                "model_state_error",
                "El estado del analizador no está disponible.",
            )
        })?
        .is_none()
    {
        let session = load_session(&target)?;
        *state.session.lock().map_err(|_| {
            error(
                "model_state_error",
                "El estado del analizador no está disponible.",
            )
        })? = Some(Arc::new(session));
    }
    Ok(PrepareModelResult {
        model_id: MODEL.model_id,
        version: MODEL.version,
        ready: true,
        reused,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loaded_session_returns_reused_result_without_model_io() {
        let session = Mutex::new(Some(Arc::new(7_u8)));

        let result = prepared_result_if_loaded(&session).unwrap().unwrap();

        assert_eq!(result.model_id, MODEL.model_id);
        assert_eq!(result.version, MODEL.version);
        assert!(result.ready);
        assert!(result.reused);
    }

    #[test]
    fn missing_session_continues_to_initial_model_preparation() {
        let session = Mutex::<Option<Arc<u8>>>::new(None);

        assert!(prepared_result_if_loaded(&session).unwrap().is_none());
    }

    #[test]
    fn cloned_ready_value_does_not_hold_its_mutex_while_consumed() {
        let value = Mutex::new(Some(Arc::new(7_u8)));
        let observed = with_cloned_ready_value(&value, |cloned| {
            assert!(value.try_lock().is_ok());
            assert_eq!(*cloned, 7);
            Arc::strong_count(&cloned)
        });
        assert_eq!(observed, Some(2));
    }

    #[test]
    fn cloned_requests_reach_the_gate_and_busy_does_not_leak_the_permit() {
        let value = Mutex::new(Some(Arc::new(7_u8)));
        let gate = InferenceGate::default();
        let first = with_cloned_ready_value(&value, |_| gate.acquire().unwrap()).unwrap();
        let second = with_cloned_ready_value(&value, |_| gate.acquire().unwrap_err()).unwrap();
        assert_eq!(second.code, "analyzer_busy");
        drop(first);
        assert!(with_cloned_ready_value(&value, |_| gate.acquire())
            .unwrap()
            .is_ok());
        let failed = with_cloned_ready_value(&value, |_| {
            let _permit = gate.acquire()?;
            Err::<(), _>(error("forced_failure", "Fallo controlado."))
        })
        .unwrap();
        assert_eq!(failed.unwrap_err().code, "forced_failure");
        assert!(gate.acquire().is_ok());
    }

    #[test]
    fn manifest_matches_the_verified_official_artifact() {
        assert_eq!(MODEL.model_id, "discogs-maest-30s-pw-519l");
        assert_eq!(MODEL.version, 2);
        assert_eq!(MODEL.filename, "discogs-maest-30s-pw-519l-2.onnx");
        assert_eq!(MODEL.bytes, 348_052_337);
        assert_eq!(
            MODEL.sha256,
            "c90a51a752cdd94f37de886787d5e3a5b2071c6d0ef49ea788058f65f11883b1"
        );
        assert_eq!(MODEL.input_shape, [1, 1876, 96]);
        assert_eq!(MODEL.output_shape, [1, 519]);
        assert_eq!(MODEL.sample_rate, 16_000);
        assert!(MODEL
            .url
            .starts_with("https://essentia.upf.edu/models/feature-extractors/maest/"));
    }

    #[test]
    fn parser_is_strict_and_preserves_unicode() {
        assert_eq!(
            parse_discogs_label("Folk, World, & Country---Étnico").unwrap(),
            ParsedLabel {
                genre: "Folk, World, & Country".into(),
                subgenre: "Étnico".into()
            }
        );
        for malformed in ["", "Rock", "---Rock", "Rock---", "Rock---Noise---Extra"] {
            assert!(parse_discogs_label(malformed).is_err());
        }
    }

    #[test]
    fn embedded_catalog_is_complete_ordered_and_safe() {
        let catalog: DiscogsCatalog = serde_json::from_str(RAW_CATALOG).unwrap();
        assert_eq!(catalog.classes.len(), CLASS_COUNT);
        for label in &catalog.classes {
            assert_eq!(label.matches("---").count(), 1);
            assert!(parse_discogs_label(label).is_ok());
        }
        for (index, expected) in [
            (0, "Blues---Boogie Woogie"),
            (4, "Blues---East Coast Blues"),
            (9, "Blues---Memphis Blues"),
            (12, "Blues---Piedmont Blues"),
            (59, "Electronic---Deep House"),
            (158, "Folk, World, & Country---Aboriginal"),
            (241, "Hip Hop---Bass Music"),
            (270, "Hip Hop---Trap"),
            (414, "Rock---AOR"),
            (518, "Stage & Screen---Theme"),
        ] {
            assert_eq!(catalog.classes[index], expected);
        }
        assert_eq!(resolve_discogs_class(59).unwrap().genre, "Electronic");
        assert_eq!(resolve_discogs_class(59).unwrap().subgenre, "Deep House");
        assert_eq!(
            resolve_discogs_class(CLASS_COUNT).unwrap_err().code,
            "invalid_taxonomy_index"
        );
    }

    #[test]
    fn validates_output_shape_and_finite_values() {
        let mut scores = vec![0.0; CLASS_COUNT];
        scores[42] = 0.8;
        assert_eq!(validate_output(&scores).unwrap(), 42);
        assert_eq!(
            validate_output(&scores[..518]).unwrap_err().code,
            "invalid_output_shape"
        );
        scores[4] = f32::NAN;
        assert_eq!(
            validate_output(&scores).unwrap_err().code,
            "invalid_output_value"
        );
        scores[4] = f32::INFINITY;
        assert_eq!(
            validate_output(&scores).unwrap_err().code,
            "invalid_output_value"
        );
    }

    #[test]
    fn requires_one_exact_winning_score() {
        assert_eq!(
            validate_output(&vec![0.25; CLASS_COUNT]).unwrap_err().code,
            "ambiguous_output"
        );

        let mut tied = vec![-2.0; CLASS_COUNT];
        tied[17] = 0.75;
        tied[301] = 0.75;
        assert_eq!(validate_output(&tied).unwrap_err().code, "ambiguous_output");

        let mut negative = vec![-10.0; CLASS_COUNT];
        negative[208] = -0.5;
        assert_eq!(validate_output(&negative).unwrap(), 208);
    }

    #[test]
    fn permits_only_one_inference() {
        let gate = InferenceGate::default();
        let permit = gate.acquire().unwrap();
        assert_eq!(gate.acquire().unwrap_err().code, "analyzer_busy");
        drop(permit);
        assert!(gate.acquire().is_ok());
    }

    #[test]
    fn rejects_an_incorrect_preprocessed_tensor_before_runtime() {
        let error = validate_preprocessed_len(INPUT_FRAMES * INPUT_BANDS - 1).unwrap_err();
        assert_eq!(error.code, "invalid_input_shape");
        assert!(validate_preprocessed_len(INPUT_FRAMES * INPUT_BANDS).is_ok());
    }

    #[test]
    fn verifies_hash_size_missing_and_corrupt_fixtures() {
        let directory =
            std::env::temp_dir().join(format!("djorganizer-maest-{}", std::process::id()));
        let _ = fs::remove_dir_all(&directory);
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("fixture.onnx");
        assert!(!verify_artifact(&path, 3, "unused").unwrap());
        fs::write(&path, b"abc").unwrap();
        assert!(verify_artifact(
            &path,
            3,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
        .unwrap());
        assert!(!verify_artifact(
            &path,
            2,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        )
        .unwrap());
        assert!(!verify_artifact(&path, 3, "incorrect").unwrap());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    #[ignore = "downloads are forbidden in the normal test suite; set DJORGANIZER_MAEST_MODEL to a verified official ONNX"]
    fn runs_the_official_model_with_a_deterministic_tensor() {
        let path = std::env::var_os("DJORGANIZER_MAEST_MODEL")
            .expect("set the isolated verified model path");
        let path = Path::new(&path);

        println!("stage=integrity");
        assert!(
            verify_model(path).unwrap(),
            "the isolated model must match the pinned manifest"
        );

        println!("stage=session");
        let session = Session::builder()
            .unwrap_or_else(|error| panic!("stage=session builder_error={error:?}"))
            .with_intra_threads(1)
            .unwrap_or_else(|error| panic!("stage=session thread_error={error:?}"))
            .commit_from_file(path)
            .unwrap_or_else(|error| panic!("stage=session ort_error={error:?}"));

        println!("stage=contract");
        validate_session(&session).unwrap_or_else(|error| panic!("stage=contract error={error:?}"));

        println!("stage=inference");
        let input = Array3::from_shape_vec(
            (1, INPUT_FRAMES, INPUT_BANDS),
            vec![0.0_f32; INPUT_FRAMES * INPUT_BANDS],
        )
        .expect("the deterministic tensor shape is valid");
        let inputs = ort::inputs![MODEL.input_name => input]
            .unwrap_or_else(|error| panic!("stage=inference input_error={error:?}"));
        let outputs = session
            .run(inputs)
            .unwrap_or_else(|error| panic!("stage=inference ort_error={error:?}"));

        println!("stage=output");
        let output = outputs
            .get(MODEL.output_name)
            .unwrap_or_else(|| panic!("stage=output missing={}", MODEL.output_name));
        let tensor = output
            .try_extract_tensor::<f32>()
            .unwrap_or_else(|error| panic!("stage=output tensor_error={error:?}"));
        assert_eq!(tensor.shape(), MODEL.output_shape);
        let scores = tensor.iter().copied().collect::<Vec<_>>();
        validate_output(&scores).unwrap();

        println!("model verified\ninput=[1,1876,96]\noutput=[1,519]\nfinite=true");
    }
}
