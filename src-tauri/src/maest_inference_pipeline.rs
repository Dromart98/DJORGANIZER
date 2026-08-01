//! Internal orchestration from trusted media bytes to one Discogs proposal.

use ort::session::Session;
use symphonia::core::io::MediaSource;

use crate::{
    maest::{
        resolve_discogs_class, run_preprocessed, validate_output, validate_score_vector,
        AnalysisError, AnalyzerIdentity, InferenceGate, MaestAnalysisResult, ParsedLabel,
        ProposedTextField, ANALYZER_ID, ANALYZER_VERSION, COMPATIBILITY_KEY,
    },
    maest_pipeline::{preprocess_media_windows, MaestPipelineError},
};

#[derive(Debug, PartialEq)]
pub(crate) struct MaestInferencePipelineError {
    pub(crate) stage: &'static str,
    pub(crate) code: String,
    pub(crate) message: String,
}

impl MaestInferencePipelineError {
    fn new(stage: &'static str, error: AnalysisError) -> Self {
        Self {
            stage,
            code: error.code,
            message: error.message,
        }
    }
}

pub(crate) fn analyze_media_source(
    session: &Session,
    gate: &InferenceGate,
    source: Box<dyn MediaSource>,
    analyzed_at: &str,
) -> Result<MaestAnalysisResult, MaestInferencePipelineError> {
    let mut source = Some(source);
    analyze_media_sources_with(
        gate,
        None,
        || {
            Ok(source
                .take()
                .expect("the fallback opens exactly one source"))
        },
        analyzed_at,
        |tensor| run_preprocessed(session, tensor),
        resolve_discogs_class,
    )
}

pub(crate) fn analyze_media_sources<F>(
    session: &Session,
    gate: &InferenceGate,
    duration_seconds: Option<f64>,
    source: F,
    analyzed_at: &str,
) -> Result<MaestAnalysisResult, MaestInferencePipelineError>
where
    F: FnMut() -> Result<Box<dyn MediaSource>, MaestPipelineError>,
{
    analyze_media_sources_with(
        gate,
        duration_seconds,
        source,
        analyzed_at,
        |tensor| run_preprocessed(session, tensor),
        resolve_discogs_class,
    )
}

fn analyze_media_sources_with<F, Run, Resolve>(
    gate: &InferenceGate,
    duration_seconds: Option<f64>,
    source: F,
    analyzed_at: &str,
    run: Run,
    resolve: Resolve,
) -> Result<MaestAnalysisResult, MaestInferencePipelineError>
where
    F: FnMut() -> Result<Box<dyn MediaSource>, MaestPipelineError>,
    Run: FnMut(Vec<f32>) -> Result<Vec<f32>, AnalysisError>,
    Resolve: FnOnce(usize) -> Result<ParsedLabel, AnalysisError>,
{
    let tensors = preprocess_media_windows(duration_seconds, source).map_err(|error| {
        MaestInferencePipelineError::new(
            error.stage,
            AnalysisError {
                code: error.code,
                message: "No se pudo preparar el audio para el análisis.".into(),
            },
        )
    })?;

    // All bounded preprocessing happens before one permit. A track's windows cannot interleave.
    let scores = {
        let _permit = gate
            .acquire()
            .map_err(|error| MaestInferencePipelineError::new("inference", error))?;
        let mut run = run;
        let mut outputs = Vec::with_capacity(tensors.len());
        for tensor in tensors {
            let output = run(tensor)
                .map_err(|error| MaestInferencePipelineError::new("inference", error))?;
            validate_score_vector(&output)
                .map_err(|error| MaestInferencePipelineError::new("inference", error))?;
            outputs.push(output);
        }
        aggregate_scores(&outputs)
            .map_err(|error| MaestInferencePipelineError::new("inference", error))?
    };
    let winner = validate_output(&scores)
        .map_err(|error| MaestInferencePipelineError::new("inference", error))?;
    let score = scores[winner];
    let label =
        resolve(winner).map_err(|error| MaestInferencePipelineError::new("taxonomy", error))?;

    let proposed_field = |field, proposed_value| ProposedTextField {
        field,
        status: "completed",
        source: "automatic",
        proposed_value: Some(proposed_value),
        score: Some(score),
        error: None,
        analyzed_at: analyzed_at.into(),
    };
    Ok(MaestAnalysisResult {
        analyzer: AnalyzerIdentity {
            id: ANALYZER_ID,
            version: ANALYZER_VERSION,
        },
        compatibility_key: COMPATIBILITY_KEY,
        genre: proposed_field("genre", label.genre),
        subgenre: proposed_field("subgenre", label.subgenre),
        partial_errors: Vec::new(),
    })
}

fn aggregate_scores(outputs: &[Vec<f32>]) -> Result<Vec<f32>, AnalysisError> {
    if outputs.is_empty() {
        return Err(AnalysisError {
            code: "empty_output".into(),
            message: "El modelo no devolvió predicciones.".into(),
        });
    }
    let mut aggregate = vec![0.0_f32; crate::maest::CLASS_COUNT];
    for output in outputs {
        validate_score_vector(output)?;
        for (total, score) in aggregate.iter_mut().zip(output) {
            *total += *score;
        }
    }
    let count = outputs.len() as f32;
    for score in &mut aggregate {
        *score /= count;
    }
    if aggregate.iter().any(|score| !score.is_finite()) {
        return Err(AnalysisError {
            code: "invalid_output_value".into(),
            message: "El modelo devolvió valores no finitos.".into(),
        });
    }
    Ok(aggregate)
}

#[cfg(test)]
fn analyze_media_source_with<Run, Resolve>(
    gate: &InferenceGate,
    source: Box<dyn MediaSource>,
    analyzed_at: &str,
    run: Run,
    resolve: Resolve,
) -> Result<MaestAnalysisResult, MaestInferencePipelineError>
where
    Run: FnMut(Vec<f32>) -> Result<Vec<f32>, AnalysisError>,
    Resolve: FnOnce(usize) -> Result<ParsedLabel, AnalysisError>,
{
    let mut source = Some(source);
    analyze_media_sources_with(
        gate,
        None,
        || Ok(source.take().expect("single-window test source")),
        analyzed_at,
        run,
        resolve,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::maest::{load_session, verify_model, LEGACY_COMPATIBILITY_KEY};
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use std::{cell::Cell, io::Cursor, path::Path};

    const WAV_16_KHZ: &str = include_str!("../tests/fixtures/maest-pipeline-16khz.wav.b64");

    fn audio_source() -> Box<dyn MediaSource> {
        let bytes = STANDARD
            .decode(WAV_16_KHZ.split_whitespace().collect::<String>())
            .unwrap();
        Box::new(Cursor::new(bytes))
    }

    fn scores(winner: usize, score: f32) -> Vec<f32> {
        let mut scores = vec![0.0; crate::maest::CLASS_COUNT];
        scores[winner] = score;
        scores
    }

    #[test]
    fn arithmetic_mean_of_two_and_three_score_vectors_drives_the_winner() {
        let mut first = scores(10, 6.0);
        first[11] = 1.0;
        let mut second = scores(11, 5.0);
        second[10] = 2.0;
        let two = aggregate_scores(&[first.clone(), second.clone()]).unwrap();
        assert_eq!(two[10], 4.0);
        assert_eq!(two[11], 3.0);
        assert_eq!(validate_output(&two).unwrap(), 10);

        let mut third = scores(11, 9.0);
        third[10] = 1.0;
        let three = aggregate_scores(&[first, second, third]).unwrap();
        assert_eq!(three[10], 3.0);
        assert_eq!(three[11], 5.0);
        assert_eq!(validate_output(&three).unwrap(), 11);
        assert!(three.iter().all(|score| score.is_finite()));
    }

    #[test]
    fn an_exact_aggregate_maximum_tie_remains_ambiguous() {
        let first = scores(10, 2.0);
        let second = scores(11, 2.0);
        let aggregate = aggregate_scores(&[first, second]).unwrap();
        let error = validate_output(&aggregate).unwrap_err();
        assert_eq!(error.code, "ambiguous_output");
    }

    #[test]
    fn audio_tensor_to_discogs_proposal_preserves_contract_and_raw_score() {
        let gate = InferenceGate::default();
        let result = analyze_media_source_with(
            &gate,
            audio_source(),
            "2026-07-29T12:00:00Z",
            |tensor| {
                assert_eq!(tensor.len(), 1876 * 96);
                assert!(tensor.iter().all(|value| value.is_finite()));
                Ok(scores(59, 3.25))
            },
            resolve_discogs_class,
        )
        .unwrap();

        assert_eq!(result.analyzer.id, ANALYZER_ID);
        assert_eq!(result.analyzer.version, ANALYZER_VERSION);
        assert_eq!(result.compatibility_key, COMPATIBILITY_KEY);
        assert_ne!(result.compatibility_key, LEGACY_COMPATIBILITY_KEY);
        assert_eq!(result.genre.field, "genre");
        assert_eq!(result.genre.status, "completed");
        assert_eq!(result.genre.source, "automatic");
        assert_eq!(result.genre.proposed_value.as_deref(), Some("Electronic"));
        assert_eq!(
            result.subgenre.proposed_value.as_deref(),
            Some("Deep House")
        );
        assert_eq!(result.genre.score, Some(3.25));
        assert_eq!(result.subgenre.score, Some(3.25));
        assert_eq!(result.genre.analyzed_at, "2026-07-29T12:00:00Z");
        assert!(result.partial_errors.is_empty());
    }

    #[test]
    fn same_audio_and_scores_are_deterministic_except_for_supplied_time() {
        let run = |time| {
            analyze_media_source_with(
                &InferenceGate::default(),
                audio_source(),
                time,
                |_| Ok(scores(59, 0.75)),
                resolve_discogs_class,
            )
            .unwrap()
        };
        let first = run("first");
        let second = run("second");
        assert_eq!(first.genre.proposed_value, second.genre.proposed_value);
        assert_eq!(
            first.subgenre.proposed_value,
            second.subgenre.proposed_value
        );
        assert_eq!(first.genre.score, second.genre.score);
        assert_ne!(first.genre.analyzed_at, second.genre.analyzed_at);
    }

    #[test]
    fn preprocessing_failures_keep_their_stage_and_skip_inference() {
        for (source, expected_stage) in [
            (
                Box::new(Cursor::new(b"not audio".to_vec())) as Box<dyn MediaSource>,
                "decode",
            ),
            (
                Box::new(Cursor::new(vec![0_u8; 44])) as Box<dyn MediaSource>,
                "decode",
            ),
        ] {
            let called = Cell::new(false);
            let error = analyze_media_source_with(
                &InferenceGate::default(),
                source,
                "now",
                |_| {
                    called.set(true);
                    Ok(scores(0, 1.0))
                },
                resolve_discogs_class,
            )
            .unwrap_err();
            assert_eq!(error.stage, expected_stage);
            assert!(!called.get());
        }

        let bytes = STANDARD
            .decode(WAV_16_KHZ.split_whitespace().collect::<String>())
            .unwrap();
        let mut short = bytes[..44 + 16_000 * 2].to_vec();
        let riff_size = short.len() as u32 - 8;
        short[4..8].copy_from_slice(&riff_size.to_le_bytes());
        short[40..44].copy_from_slice(&(16_000_u32 * 2).to_le_bytes());
        let called = Cell::new(false);
        let error = analyze_media_source_with(
            &InferenceGate::default(),
            Box::new(Cursor::new(short)),
            "now",
            |_| {
                called.set(true);
                Ok(scores(0, 1.0))
            },
            resolve_discogs_class,
        )
        .unwrap_err();
        assert_eq!(error.stage, "preprocess");
        assert!(!called.get());
    }

    #[test]
    fn inference_and_taxonomy_failures_have_stable_stages() {
        for invalid in [vec![0.0; 518], {
            let mut values = scores(0, 1.0);
            values[1] = f32::NAN;
            values
        }] {
            let error = analyze_media_source_with(
                &InferenceGate::default(),
                audio_source(),
                "now",
                |_| Ok(invalid.clone()),
                resolve_discogs_class,
            )
            .unwrap_err();
            assert_eq!(error.stage, "inference");
            assert!(matches!(
                error.code.as_str(),
                "invalid_output_shape" | "invalid_output_value"
            ));
        }
        let error = analyze_media_source_with(
            &InferenceGate::default(),
            audio_source(),
            "now",
            |_| Ok(scores(59, 1.0)),
            |_| {
                Err(AnalysisError {
                    code: "invalid_taxonomy_index".into(),
                    message: "invalid".into(),
                })
            },
        )
        .unwrap_err();
        assert_eq!(error.stage, "taxonomy");
        assert_eq!(error.code, "invalid_taxonomy_index");
    }

    #[test]
    fn exact_maximum_tie_skips_taxonomy_and_releases_the_gate() {
        let gate = InferenceGate::default();
        let resolved = Cell::new(false);
        let error = analyze_media_source_with(
            &gate,
            audio_source(),
            "now",
            |_| {
                let mut values = scores(59, 0.8);
                values[60] = 0.8;
                Ok(values)
            },
            |_| {
                resolved.set(true);
                resolve_discogs_class(59)
            },
        )
        .unwrap_err();

        assert_eq!(
            (error.stage, error.code.as_str()),
            ("inference", "ambiguous_output")
        );
        assert!(!resolved.get());
        assert!(gate.acquire().is_ok());
    }

    #[test]
    fn gate_is_busy_only_during_inference_and_releases_after_all_outcomes() {
        let gate = InferenceGate::default();
        let held = gate.acquire().unwrap();
        let error = analyze_media_source_with(
            &gate,
            audio_source(),
            "now",
            |_| Ok(scores(0, 1.0)),
            resolve_discogs_class,
        )
        .unwrap_err();
        assert_eq!(
            (error.stage, error.code.as_str()),
            ("inference", "analyzer_busy")
        );
        drop(held);

        let error = analyze_media_source_with(
            &gate,
            audio_source(),
            "now",
            |_| {
                Err(AnalysisError {
                    code: "inference_failed".into(),
                    message: "failed".into(),
                })
            },
            resolve_discogs_class,
        )
        .unwrap_err();
        assert_eq!(
            (error.stage, error.code.as_str()),
            ("inference", "inference_failed")
        );
        assert!(gate.acquire().is_ok());

        analyze_media_source_with(
            &gate,
            audio_source(),
            "now",
            |_| Ok(scores(0, 1.0)),
            resolve_discogs_class,
        )
        .unwrap();
        assert!(gate.acquire().is_ok());
    }

    #[test]
    fn executor_takes_ownership_of_the_single_tensor_vector() {
        analyze_media_source_with(
            &InferenceGate::default(),
            audio_source(),
            "now",
            |tensor: Vec<f32>| {
                assert_eq!(tensor.capacity(), tensor.len());
                Ok(scores(0, 1.0))
            },
            resolve_discogs_class,
        )
        .unwrap();
    }

    #[test]
    #[ignore = "requires DJORGANIZER_MAEST_MODEL; the normal suite never downloads model weights"]
    fn runs_audio_through_onnx_and_resolves_a_valid_discogs_class() {
        let path = std::env::var_os("DJORGANIZER_MAEST_MODEL")
            .expect("set DJORGANIZER_MAEST_MODEL to the verified official ONNX");
        let path = Path::new(&path);
        assert!(
            verify_model(path).expect("the official model artifact must be readable"),
            "DJORGANIZER_MAEST_MODEL must match the pinned size and SHA-256"
        );
        let session = load_session(path)
            .expect("the official model must satisfy the pinned input and output contract");
        let result = analyze_media_source(
            &session,
            &InferenceGate::default(),
            audio_source(),
            "isolated-test",
        )
        .unwrap();
        assert!(result.genre.proposed_value.is_some());
        assert!(result.subgenre.proposed_value.is_some());
        assert!(result.genre.score.unwrap().is_finite());
    }
}
