//! Bounded orchestration from a trusted media source to one MAEST input tensor.

use symphonia::core::io::MediaSource;

use crate::{
    audio_decoder::decode_audio,
    audio_resampler::resample_mono_to_16khz,
    maest::{INPUT_BANDS, INPUT_FRAMES},
    maest_preprocessing::preprocess_maest_pcm,
};

const TARGET_SAMPLES: usize = 480_000;
/// Thirty seconds at 48 kHz, plus one sample to detect a longer source.
const DEFAULT_DECODE_SAMPLE_LIMIT: usize = 1_440_001;
/// Maximum payload held by the decoded and resampled `f32` vectors concurrently.
const MAX_VECTOR_PAYLOAD_BYTES: usize =
    (DEFAULT_DECODE_SAMPLE_LIMIT + TARGET_SAMPLES) * size_of::<f32>();

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct MaestPipelineError {
    pub(crate) stage: &'static str,
    pub(crate) code: String,
}

impl MaestPipelineError {
    fn new(stage: &'static str, code: impl Into<String>) -> Self {
        Self {
            stage,
            code: code.into(),
        }
    }
}

/// Produces one flat, finite `1876 × 96` MAEST tensor from trusted media bytes.
pub(crate) fn preprocess_media_source(
    source: Box<dyn MediaSource>,
) -> Result<Vec<f32>, MaestPipelineError> {
    preprocess_media_source_with_limit(source, DEFAULT_DECODE_SAMPLE_LIMIT)
}

fn preprocess_media_source_with_limit(
    source: Box<dyn MediaSource>,
    decode_sample_limit: usize,
) -> Result<Vec<f32>, MaestPipelineError> {
    let decoded = decode_audio(source, decode_sample_limit)
        .map_err(|error| MaestPipelineError::new("decode", error.code))?;
    let resampled = resample_mono_to_16khz(&decoded.samples, decoded.sample_rate, TARGET_SAMPLES)
        .map_err(|error| MaestPipelineError::new("resample", error.code))?;

    if resampled.samples.len() < TARGET_SAMPLES {
        let (stage, code) = if decoded.truncated {
            ("decode", "decode_limit_insufficient")
        } else {
            ("preprocess", "audio_too_short")
        };
        return Err(MaestPipelineError::new(stage, code));
    }
    if resampled.samples.len() != TARGET_SAMPLES {
        return Err(MaestPipelineError::new(
            "resample",
            "unexpected_output_length",
        ));
    }

    // Release the larger source-rate PCM before allocating the tensor.
    let pcm = resampled.samples;
    drop(decoded);
    let tensor = preprocess_maest_pcm(&pcm)
        .map_err(|error| MaestPipelineError::new("preprocess", error.code))?;
    if tensor.len() != INPUT_FRAMES * INPUT_BANDS || tensor.iter().any(|value| !value.is_finite()) {
        return Err(MaestPipelineError::new("preprocess", "invalid_tensor"));
    }
    Ok(tensor)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use std::io::Cursor;

    const WAV_16_KHZ: &str = include_str!("../tests/fixtures/maest-pipeline-16khz.wav.b64");
    const FLAC_44_KHZ: &str = include_str!("../tests/fixtures/maest-pipeline-44khz.flac.b64");

    fn source(encoded: &str) -> Box<dyn MediaSource> {
        let compact: String = encoded.split_whitespace().collect();
        Box::new(Cursor::new(STANDARD.decode(compact).unwrap()))
    }

    #[test]
    fn maest_pipeline_wav_identity_produces_the_exact_finite_tensor() {
        let tensor = preprocess_media_source(source(WAV_16_KHZ)).unwrap();
        assert_eq!(tensor.len(), 1876 * 96);
        assert_eq!(tensor.len(), 180_096);
        assert!(tensor.iter().all(|value| value.is_finite()));
    }

    #[test]
    fn maest_pipeline_flac_is_detected_by_content_and_is_deterministic() {
        let first = preprocess_media_source(source(FLAC_44_KHZ)).unwrap();
        let second = preprocess_media_source(source(FLAC_44_KHZ)).unwrap();
        assert_eq!(first.len(), 180_096);
        assert!(first.iter().all(|value| value.is_finite()));
        assert_eq!(first, second);
    }

    #[test]
    fn maest_pipeline_rejects_short_audio_without_padding() {
        let bytes = STANDARD
            .decode(WAV_16_KHZ.split_whitespace().collect::<String>())
            .unwrap();
        let mut short_wav = bytes[..44 + 16_000 * 2].to_vec();
        let riff_size = short_wav.len() as u32 - 8;
        short_wav[4..8].copy_from_slice(&riff_size.to_le_bytes());
        short_wav[40..44].copy_from_slice(&(16_000_u32 * 2).to_le_bytes());
        let error = preprocess_media_source(Box::new(Cursor::new(short_wav))).unwrap_err();
        assert_eq!(
            error,
            MaestPipelineError::new("preprocess", "audio_too_short")
        );
    }

    #[test]
    fn maest_pipeline_reports_invalid_media_at_decode_stage() {
        let error =
            preprocess_media_source(Box::new(Cursor::new(b"not audio".to_vec()))).unwrap_err();
        assert_eq!(error.stage, "decode");
        assert_eq!(error.code, "unrecognized_format");
    }

    #[test]
    fn maest_pipeline_rejects_an_insufficient_decode_limit() {
        let error = preprocess_media_source_with_limit(source(FLAC_44_KHZ), 44_100).unwrap_err();
        assert_eq!(
            error,
            MaestPipelineError::new("decode", "decode_limit_insufficient")
        );
    }

    #[test]
    fn maest_pipeline_vector_memory_is_bounded_by_explicit_limits() {
        assert_eq!(TARGET_SAMPLES, 480_000);
        assert_eq!(DEFAULT_DECODE_SAMPLE_LIMIT, 1_440_001);
        assert_eq!(MAX_VECTOR_PAYLOAD_BYTES, 7_680_004);
    }
}
