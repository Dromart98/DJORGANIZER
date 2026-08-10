//! Bounded orchestration from a trusted media source to one MAEST input tensor.

use symphonia::core::{io::MediaSource, units::Time};

use crate::{
    audio_decoder::{
        decode_audio, decode_audio_window_with_rate_limit,
        decode_audio_window_with_rate_limit_and_cancel, DECODE_CANCELLED,
    },
    audio_resampler::resample_mono_to_16khz,
    maest::{INPUT_BANDS, INPUT_FRAMES},
    maest_preprocessing::preprocess_maest_pcm,
};
use std::sync::atomic::{AtomicBool, Ordering};

const TARGET_SAMPLES: usize = 480_000;
const MAX_PIPELINE_SAMPLE_RATE: u32 = 192_000;
const TARGET_DURATION_SECONDS: usize = 30;
pub(crate) const MAX_MAEST_WINDOWS: usize = 3;
/// Maximum payload held by the decoded and resampled `f32` vectors concurrently.
const MAX_DECODE_SAMPLES: usize = MAX_PIPELINE_SAMPLE_RATE as usize * TARGET_DURATION_SECONDS + 1;
const MAX_VECTOR_PAYLOAD_BYTES: usize = (MAX_DECODE_SAMPLES + TARGET_SAMPLES) * size_of::<f32>();

fn decode_sample_limit(sample_rate: u32, duration_seconds: usize) -> Result<usize, &'static str> {
    if sample_rate > MAX_PIPELINE_SAMPLE_RATE {
        return Err("unsupported_sample_rate");
    }
    usize::try_from(sample_rate)
        .ok()
        .and_then(|rate| rate.checked_mul(duration_seconds))
        .and_then(|samples| samples.checked_add(1))
        .ok_or("decode_limit_overflow")
}

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
    preprocess_media_window(source, Time::ZERO)
}

fn preprocess_media_window(
    source: Box<dyn MediaSource>,
    offset: Time,
) -> Result<Vec<f32>, MaestPipelineError> {
    let decoded = decode_audio_window_with_rate_limit(source, offset, |sample_rate| {
        decode_sample_limit(sample_rate, TARGET_DURATION_SECONDS)
    })
    .map_err(|error| MaestPipelineError::new("decode", error.code))?;
    preprocess_decoded_audio(decoded)
}

fn cancelled(flag: &AtomicBool) -> Result<(), MaestPipelineError> {
    if flag.load(Ordering::Acquire) {
        Err(MaestPipelineError::new("cancel", "analysis_cancelled"))
    } else {
        Ok(())
    }
}

fn preprocess_media_window_cancellable(
    source: Box<dyn MediaSource>,
    offset: Time,
    cancel: &AtomicBool,
) -> Result<Vec<f32>, MaestPipelineError> {
    cancelled(cancel)?;
    let decoded = decode_audio_window_with_rate_limit_and_cancel(
        source,
        offset,
        |sample_rate| decode_sample_limit(sample_rate, TARGET_DURATION_SECONDS),
        Some(cancel),
    )
    .map_err(|error| {
        if error.code == DECODE_CANCELLED {
            MaestPipelineError::new("cancel", "analysis_cancelled")
        } else {
            MaestPipelineError::new("decode", error.code)
        }
    })?;
    cancelled(cancel)?;
    let tensor = preprocess_decoded_audio(decoded)?;
    cancelled(cancel)?;
    Ok(tensor)
}

/// Selects start/centre/end using only confirmed native duration. Nanosecond conversion happens
/// before deduplication so every offset is an exact media-time value.
pub(crate) fn window_offsets(duration_seconds: Option<f64>) -> Vec<Time> {
    let Some(duration) = duration_seconds.filter(|value| value.is_finite() && *value >= 30.0)
    else {
        return vec![Time::ZERO];
    };
    if duration == 30.0 {
        return vec![Time::ZERO];
    }
    let last = duration - 30.0;
    let mut offsets = Vec::with_capacity(MAX_MAEST_WINDOWS);
    for seconds in [0.0, last / 2.0, last] {
        let Some(offset) = Time::try_from_secs_f64(seconds) else {
            return vec![Time::ZERO];
        };
        if !offsets.contains(&offset) {
            offsets.push(offset);
        }
    }
    offsets
}

/// Prepares at most three tensors. Each source PCM and resampled PCM is dropped inside
/// `preprocess_media_window` before the next source is opened; only bounded tensors survive.
pub(crate) fn preprocess_media_windows<F>(
    duration_seconds: Option<f64>,
    source: F,
) -> Result<Vec<Vec<f32>>, MaestPipelineError>
where
    F: FnMut() -> Result<Box<dyn MediaSource>, MaestPipelineError>,
{
    preprocess_media_windows_with(duration_seconds, source, preprocess_media_window)
}

pub(crate) fn preprocess_media_windows_cancellable<F>(
    duration_seconds: Option<f64>,
    source: F,
    cancel: &AtomicBool,
) -> Result<Vec<Vec<f32>>, MaestPipelineError>
where
    F: FnMut() -> Result<Box<dyn MediaSource>, MaestPipelineError>,
{
    preprocess_media_windows_cancellable_with_progress(
        duration_seconds,
        source,
        cancel,
        |_| {},
        |_| {},
    )
}

pub(crate) fn preprocess_media_windows_cancellable_with_progress<F, Planned, Prepared>(
    duration_seconds: Option<f64>,
    mut source: F,
    cancel: &AtomicBool,
    mut planned: Planned,
    mut prepared: Prepared,
) -> Result<Vec<Vec<f32>>, MaestPipelineError>
where
    F: FnMut() -> Result<Box<dyn MediaSource>, MaestPipelineError>,
    Planned: FnMut(usize),
    Prepared: FnMut(usize),
{
    cancelled(cancel)?;
    let offsets = window_offsets(duration_seconds);
    planned(offsets.len());
    let mut tensors = Vec::with_capacity(offsets.len());
    for (index, offset) in offsets.into_iter().enumerate() {
        cancelled(cancel)?;
        let prepared_tensor =
            source().and_then(|source| preprocess_media_window_cancellable(source, offset, cancel));
        match prepared_tensor {
            Ok(tensor) => {
                cancelled(cancel)?;
                tensors.push(tensor);
                prepared(tensors.len());
            }
            Err(error)
                if index > 0 && error.stage == "decode" && error.code == "seek_unsupported" =>
            {
                tensors.truncate(1);
                planned(1);
                break;
            }
            Err(error) => return Err(error),
        }
    }
    Ok(tensors)
}

fn preprocess_media_windows_with<F, P>(
    duration_seconds: Option<f64>,
    mut source: F,
    mut preprocess: P,
) -> Result<Vec<Vec<f32>>, MaestPipelineError>
where
    F: FnMut() -> Result<Box<dyn MediaSource>, MaestPipelineError>,
    P: FnMut(Box<dyn MediaSource>, Time) -> Result<Vec<f32>, MaestPipelineError>,
{
    let offsets = window_offsets(duration_seconds);
    let mut tensors = Vec::with_capacity(offsets.len());
    for (index, offset) in offsets.into_iter().enumerate() {
        let prepared = source().and_then(|source| preprocess(source, offset));
        match prepared {
            Ok(tensor) => tensors.push(tensor),
            // A format that cannot safely seek retains the established first-window behaviour.
            Err(error)
                if index > 0 && error.stage == "decode" && error.code == "seek_unsupported" =>
            {
                tensors.truncate(1);
                break;
            }
            Err(error) => return Err(error),
        }
    }
    debug_assert!(tensors.len() <= MAX_MAEST_WINDOWS);
    Ok(tensors)
}

fn preprocess_media_source_with_limit(
    source: Box<dyn MediaSource>,
    decode_sample_limit: usize,
) -> Result<Vec<f32>, MaestPipelineError> {
    let decoded = decode_audio(source, decode_sample_limit)
        .map_err(|error| MaestPipelineError::new("decode", error.code))?;
    preprocess_decoded_audio(decoded)
}

fn preprocess_decoded_audio(
    decoded: crate::audio_decoder::DecodedAudio,
) -> Result<Vec<f32>, MaestPipelineError> {
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

    fn wav(sample_rate: u32, seconds: usize) -> Vec<u8> {
        let data_len = sample_rate as usize * seconds * size_of::<i16>();
        let mut bytes = vec![0_u8; 44 + data_len];
        bytes[0..4].copy_from_slice(b"RIFF");
        bytes[4..8].copy_from_slice(&(36_u32 + data_len as u32).to_le_bytes());
        bytes[8..16].copy_from_slice(b"WAVEfmt ");
        bytes[16..20].copy_from_slice(&16_u32.to_le_bytes());
        bytes[20..22].copy_from_slice(&1_u16.to_le_bytes());
        bytes[22..24].copy_from_slice(&1_u16.to_le_bytes());
        bytes[24..28].copy_from_slice(&sample_rate.to_le_bytes());
        bytes[28..32].copy_from_slice(&(sample_rate * 2).to_le_bytes());
        bytes[32..34].copy_from_slice(&2_u16.to_le_bytes());
        bytes[34..36].copy_from_slice(&16_u16.to_le_bytes());
        bytes[36..40].copy_from_slice(b"data");
        bytes[40..44].copy_from_slice(&(data_len as u32).to_le_bytes());
        bytes
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
    fn maest_pipeline_accepts_thirty_seconds_at_high_sample_rates() {
        for sample_rate in [96_000, 192_000] {
            let tensor =
                preprocess_media_source(Box::new(Cursor::new(wav(sample_rate, 30)))).unwrap();
            assert_eq!(tensor.len(), 180_096, "source rate {sample_rate}");
            assert!(tensor.iter().all(|value| value.is_finite()));
        }
    }

    #[test]
    fn maest_pipeline_rejects_rates_above_the_explicit_maximum() {
        let error = preprocess_media_source(Box::new(Cursor::new(wav(192_001, 1)))).unwrap_err();
        assert_eq!(
            error,
            MaestPipelineError::new("decode", "unsupported_sample_rate")
        );
    }

    #[test]
    fn maest_pipeline_rejects_short_high_rate_audio_without_padding() {
        let error = preprocess_media_source(Box::new(Cursor::new(wav(96_000, 29)))).unwrap_err();
        assert_eq!(
            error,
            MaestPipelineError::new("preprocess", "audio_too_short")
        );
    }

    #[test]
    fn maest_pipeline_uses_exactly_one_window_from_long_audio() {
        let tensor = preprocess_media_source(Box::new(Cursor::new(wav(16_000, 31)))).unwrap();
        assert_eq!(tensor.len(), 180_096);
    }

    #[test]
    fn maest_pipeline_decode_limit_is_checked_and_rate_dependent() {
        for rate in [16_000, 44_100, 48_000, 88_200, 96_000, 192_000] {
            assert_eq!(
                decode_sample_limit(rate, TARGET_DURATION_SECONDS).unwrap(),
                rate as usize * TARGET_DURATION_SECONDS + 1
            );
        }
        assert_eq!(
            decode_sample_limit(192_000, usize::MAX),
            Err("decode_limit_overflow")
        );
    }

    #[test]
    fn maest_pipeline_vector_memory_is_bounded_by_explicit_limits() {
        assert_eq!(TARGET_SAMPLES, 480_000);
        assert_eq!(MAX_DECODE_SAMPLES, 5_760_001);
        assert_eq!(MAX_VECTOR_PAYLOAD_BYTES, 24_960_004);
        assert_eq!(MAX_MAEST_WINDOWS, 3);
        assert_eq!(MAX_MAEST_WINDOWS * INPUT_FRAMES * INPUT_BANDS, 540_288);
    }

    #[test]
    fn window_selection_is_deterministic_and_falls_back_safely() {
        assert_eq!(window_offsets(Some(30.0)), vec![Time::ZERO]);
        assert_eq!(window_offsets(None), vec![Time::ZERO]);
        assert_eq!(window_offsets(Some(f64::NAN)), vec![Time::ZERO]);
        assert_eq!(window_offsets(Some(29.9)), vec![Time::ZERO]);
        assert_eq!(
            window_offsets(Some(90.0)),
            vec![
                Time::ZERO,
                Time::try_from_secs_f64(30.0).unwrap(),
                Time::try_from_secs_f64(60.0).unwrap(),
            ]
        );
    }

    #[test]
    fn offsets_are_deduplicated_after_media_time_conversion() {
        assert_eq!(window_offsets(Some(30.0 + 1e-10)), vec![Time::ZERO]);
    }

    #[test]
    fn multi_window_preprocessing_keeps_only_three_bounded_tensors() {
        let bytes = wav(16_000, 90);
        let mut opened = 0;
        let tensors = preprocess_media_windows(Some(90.0), || {
            opened += 1;
            Ok(Box::new(Cursor::new(bytes.clone())) as Box<dyn MediaSource>)
        })
        .unwrap();
        assert_eq!(opened, 3);
        assert_eq!(tensors.len(), MAX_MAEST_WINDOWS);
        assert!(tensors
            .iter()
            .all(|tensor| tensor.len() == INPUT_FRAMES * INPUT_BANDS));
    }

    fn controlled_windows(
        failure: Option<(usize, &'static str, &'static str)>,
    ) -> Result<Vec<Vec<f32>>, MaestPipelineError> {
        let mut index = 0;
        preprocess_media_windows_with(
            Some(90.0),
            || Ok(Box::new(Cursor::new(vec![1_u8])) as Box<dyn MediaSource>),
            move |_, _| {
                let current = index;
                index += 1;
                if let Some((failed, stage, code)) = failure {
                    if current == failed {
                        return Err(MaestPipelineError::new(stage, code));
                    }
                }
                Ok(vec![current as f32])
            },
        )
    }

    #[test]
    fn only_seek_unsupported_on_a_later_window_falls_back_to_the_first() {
        assert_eq!(
            controlled_windows(Some((1, "decode", "seek_unsupported"))).unwrap(),
            vec![vec![0.0]]
        );
        assert_eq!(
            controlled_windows(Some((2, "decode", "seek_unsupported"))).unwrap(),
            vec![vec![0.0]]
        );
    }

    #[test]
    fn cancellable_progress_reports_real_windows_and_seek_fallback() {
        let cancel = AtomicBool::new(false);
        let planned = std::cell::RefCell::new(Vec::new());
        let prepared = std::cell::RefCell::new(Vec::new());
        let mut index = 0;
        let tensors = preprocess_media_windows_cancellable_with_progress(
            Some(90.0),
            || {
                index += 1;
                if index == 2 {
                    return Err(MaestPipelineError::new("decode", "seek_unsupported"));
                }
                Ok(source(WAV_16_KHZ))
            },
            &cancel,
            |total| planned.borrow_mut().push(total),
            |count| prepared.borrow_mut().push(count),
        )
        .unwrap();
        assert_eq!(tensors.len(), 1);
        assert_eq!(*planned.borrow(), vec![3, 1]);
        assert_eq!(*prepared.borrow(), vec![1]);
    }

    #[test]
    fn later_decode_and_preprocess_errors_are_propagated_without_discarding_context() {
        for failure in [
            (1, "decode", "decode_failed"),
            (1, "preprocess", "invalid_tensor"),
            (2, "decode", "non_finite_sample"),
        ] {
            let error = controlled_windows(Some(failure)).unwrap_err();
            assert_eq!((error.stage, error.code.as_str()), (failure.1, failure.2));
        }
        assert_eq!(controlled_windows(None).unwrap().len(), 3);
    }
}
