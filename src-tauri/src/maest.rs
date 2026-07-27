//! Security boundary and neutral result contract for the desktop MAEST analyzer.
//!
//! Model acquisition is deliberately fail-closed until the official artifact digest can be
//! reproduced in CI. Audio paths never appear in the public DTOs defined here.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

pub const ANALYZER_ID: &str = "djorganizer.desktop.genre.maest";
pub const ANALYZER_VERSION: &str = "discogs-maest-30s-pw-519l@1";
pub const COMPATIBILITY_KEY: &str = "maest-519l|mel-16000-1876x96-f32|v1";
pub const CLASS_COUNT: usize = 519;
pub const INPUT_FRAMES: usize = 1876;
pub const INPUT_BANDS: usize = 96;
pub const SAMPLE_RATE: u32 = 16_000;

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
    /// Raw sigmoid score used only for ranking; it is not a calibrated probability.
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

pub fn parse_discogs_label(label: &str) -> Result<ParsedLabel, AnalysisError> {
    let mut parts = label.split("---");
    let genre = parts.next().unwrap_or_default();
    let subgenre = parts.next().unwrap_or_default();
    if genre.is_empty() || subgenre.is_empty() || parts.next().is_some() {
        return Err(AnalysisError {
            code: "invalid_taxonomy_label".into(),
            message: "La etiqueta oficial no tiene la estructura Discogs esperada.".into(),
        });
    }
    Ok(ParsedLabel {
        genre: genre.into(),
        subgenre: subgenre.into(),
    })
}

pub fn validate_output(scores: &[f32]) -> Result<usize, AnalysisError> {
    if scores.len() != CLASS_COUNT {
        return Err(AnalysisError {
            code: "invalid_output_shape".into(),
            message: "El modelo devolvió una salida incompatible.".into(),
        });
    }
    if scores.iter().any(|score| !score.is_finite()) {
        return Err(AnalysisError {
            code: "invalid_output_value".into(),
            message: "El modelo devolvió valores no finitos.".into(),
        });
    }
    scores
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.total_cmp(b))
        .map(|(index, _)| index)
        .ok_or_else(|| AnalysisError {
            code: "empty_output".into(),
            message: "El modelo no devolvió predicciones.".into(),
        })
}

/// Process-wide, fail-fast single-inference gate. It prevents a second model copy from starting.
#[derive(Debug, Default)]
pub struct InferenceGate(AtomicBool);

pub struct InferencePermit<'a>(&'a AtomicBool);

impl InferenceGate {
    pub fn acquire(&self) -> Result<InferencePermit<'_>, AnalysisError> {
        self.0
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| InferencePermit(&self.0))
            .map_err(|_| AnalysisError {
                code: "analyzer_busy".into(),
                message: "Ya hay un análisis MAEST en curso.".into(),
            })
    }
}
impl Drop for InferencePermit<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_unicode_without_translation() {
        assert_eq!(
            parse_discogs_label("Folk, World, & Country---Étnico").unwrap(),
            ParsedLabel {
                genre: "Folk, World, & Country".into(),
                subgenre: "Étnico".into()
            }
        );
    }
    #[test]
    fn rejects_malformed_labels() {
        for value in ["", "Rock", "---Rock", "Rock---", "Rock---Noise---Extra"] {
            assert!(parse_discogs_label(value).is_err());
        }
    }
    #[test]
    fn validates_exactly_519_finite_outputs() {
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
    fn stable_contract_identity() {
        assert_eq!(ANALYZER_ID, "djorganizer.desktop.genre.maest");
        assert_eq!(ANALYZER_VERSION, "discogs-maest-30s-pw-519l@1");
        assert_eq!(COMPATIBILITY_KEY, "maest-519l|mel-16000-1876x96-f32|v1");
    }
}
