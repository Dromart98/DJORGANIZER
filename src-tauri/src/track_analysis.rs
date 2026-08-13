use std::{
    fs::File,
    sync::atomic::{AtomicBool, Ordering},
};

use rustfft::{num_complex::Complex, FftPlanner};
use serde::Serialize;
use symphonia::core::io::MediaSource;

use crate::audio_decoder::{decode_audio_window_with_rate_limit_and_cancel, DECODE_CANCELLED};

const MAX_ANALYSIS_SECONDS: usize = 90;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AnalysisField<T> {
    status: &'static str,
    value: Option<T>,
    confidence: Option<f64>,
    error: Option<&'static str>,
}

impl<T> AnalysisField<T> {
    fn completed(value: T, confidence: f64) -> Self {
        Self {
            status: "completed",
            value: Some(value),
            confidence: Some(round3(confidence)),
            error: None,
        }
    }

    fn failed(error: &'static str) -> Self {
        Self {
            status: "failed",
            value: None,
            confidence: None,
            error: Some(error),
        }
    }
}

#[derive(Debug, PartialEq)]
pub(crate) struct TrackAnalysis {
    pub(crate) bpm: AnalysisField<f64>,
    pub(crate) musical_key: AnalysisField<String>,
    pub(crate) camelot_key: AnalysisField<String>,
    pub(crate) energy: AnalysisField<u8>,
}

pub(crate) struct TrackAnalysisError {
    pub(crate) stage: &'static str,
    pub(crate) code: &'static str,
}

pub(crate) fn analyze_file(
    file: File,
    cancel: &AtomicBool,
) -> Result<TrackAnalysis, TrackAnalysisError> {
    let decoded = decode_audio_window_with_rate_limit_and_cancel(
        Box::new(file) as Box<dyn MediaSource>,
        Default::default(),
        |rate| {
            (rate as usize)
                .checked_mul(MAX_ANALYSIS_SECONDS)
                .ok_or("invalid_sample_rate")
        },
        Some(cancel),
    )
    .map_err(|error| TrackAnalysisError {
        stage: if error.code == DECODE_CANCELLED {
            "cancel"
        } else {
            "decode"
        },
        code: if error.code == DECODE_CANCELLED {
            "analysis_cancelled"
        } else {
            error.code
        },
    })?;
    if cancel.load(Ordering::Acquire) {
        return Err(TrackAnalysisError {
            stage: "cancel",
            code: "analysis_cancelled",
        });
    }
    Ok(analyze_samples(
        &decoded.samples,
        decoded.sample_rate,
        cancel,
    ))
}

fn analyze_samples(samples: &[f32], sample_rate: u32, cancel: &AtomicBool) -> TrackAnalysis {
    let energy = analyze_energy(samples, sample_rate, cancel);
    let bpm = if cancel.load(Ordering::Acquire) {
        AnalysisField::failed("analysis_cancelled")
    } else {
        analyze_bpm(samples, sample_rate, cancel)
    };
    let (musical_key, camelot_key) = if cancel.load(Ordering::Acquire) {
        (
            AnalysisField::failed("analysis_cancelled"),
            AnalysisField::failed("analysis_cancelled"),
        )
    } else {
        analyze_key(samples, sample_rate, cancel)
    };
    TrackAnalysis {
        bpm,
        musical_key,
        camelot_key,
        energy,
    }
}

fn analyze_energy(samples: &[f32], sample_rate: u32, cancel: &AtomicBool) -> AnalysisField<u8> {
    if samples.is_empty() || sample_rate == 0 {
        return AnalysisField::failed("insufficient_audio");
    }
    let mut squares = 0.0_f64;
    let mut peak = 0.0_f64;
    let mut crossings = 0usize;
    let mut previous = samples[0].clamp(-1.0, 1.0);
    for (index, &sample) in samples.iter().enumerate() {
        if index % 16_384 == 0 && cancel.load(Ordering::Acquire) {
            return AnalysisField::failed("analysis_cancelled");
        }
        let sample = sample.clamp(-1.0, 1.0);
        squares += f64::from(sample * sample);
        peak = peak.max(f64::from(sample.abs()));
        if (sample >= 0.0) != (previous >= 0.0) {
            crossings += 1;
        }
        previous = sample;
    }
    let rms = (squares / samples.len() as f64).sqrt();
    let rms_db = 20.0 * rms.max(1e-9).log10();
    let crest_db = 20.0 * (peak / rms.max(1e-9)).max(1.0).log10();
    let zcr = crossings as f64 / samples.len().saturating_sub(1).max(1) as f64;
    let clamp = |value: f64| value.clamp(0.0, 100.0);
    let score = clamp(
        clamp((rms_db + 60.0) / 54.0 * 100.0) * 0.72
            + clamp(zcr / 0.22 * 100.0) * 0.18
            + (100.0 - clamp(crest_db / 20.0 * 100.0)) * 0.1,
    );
    let confidence = (samples.len() as f64 / sample_rate as f64 / 30.0).clamp(0.0, 1.0);
    AnalysisField::completed((score / 10.0).round() as u8, confidence)
}

fn analyze_bpm(samples: &[f32], sample_rate: u32, cancel: &AtomicBool) -> AnalysisField<f64> {
    if samples.len() < sample_rate as usize * 8 {
        return AnalysisField::failed("insufficient_audio");
    }
    let target_rate = 200usize;
    let step = (sample_rate as usize / target_rate).max(1);
    let envelope: Vec<f64> = samples
        .chunks(step)
        .map(|chunk| chunk.iter().map(|v| f64::from(v.abs())).sum::<f64>() / chunk.len() as f64)
        .collect();
    let min_lag = target_rate * 60 / 200;
    let max_lag = target_rate * 60 / 60;
    let mean = envelope.iter().sum::<f64>() / envelope.len() as f64;
    let centered: Vec<f64> = envelope.iter().map(|value| value - mean).collect();
    let scores: Vec<(usize, f64)> = (min_lag..=max_lag)
        .take_while(|_| !cancel.load(Ordering::Acquire))
        .map(|lag| {
            let score = centered[..centered.len() - lag]
                .iter()
                .zip(&centered[lag..])
                .map(|(a, b)| a * b)
                .sum();
            (lag, score)
        })
        .collect();
    if cancel.load(Ordering::Acquire) {
        return AnalysisField::failed("analysis_cancelled");
    }
    let Some(&(lag, score)) = scores.iter().max_by(|a, b| a.1.total_cmp(&b.1)) else {
        return AnalysisField::failed("bpm_not_detected");
    };
    let norm = centered.iter().map(|v| v * v).sum::<f64>().max(1e-9);
    if score <= 0.0 {
        return AnalysisField::failed("bpm_not_detected");
    }
    let bpm = (60.0 * target_rate as f64 / lag as f64 * 100.0).round() / 100.0;
    AnalysisField::completed(bpm, (score / norm).clamp(0.0, 1.0))
}

fn analyze_key(
    samples: &[f32],
    sample_rate: u32,
    cancel: &AtomicBool,
) -> (AnalysisField<String>, AnalysisField<String>) {
    const SIZE: usize = 4096;
    if samples.len() < SIZE || sample_rate == 0 {
        return failed_key("insufficient_audio");
    }
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(SIZE);
    let mut chroma = [0.0_f64; 12];
    let mut frames = 0usize;
    for source in samples.chunks(SIZE * 2).take(160) {
        if cancel.load(Ordering::Acquire) {
            return failed_key("analysis_cancelled");
        }
        if source.len() < SIZE {
            break;
        }
        let mut buffer: Vec<Complex<f32>> = source[..SIZE]
            .iter()
            .enumerate()
            .map(|(i, value)| {
                let window = 0.5 - 0.5 * (std::f32::consts::TAU * i as f32 / SIZE as f32).cos();
                Complex::new(value * window, 0.0)
            })
            .collect();
        fft.process(&mut buffer);
        for (bin, value) in buffer.iter().enumerate().take(SIZE / 2).skip(1) {
            let frequency = bin as f64 * sample_rate as f64 / SIZE as f64;
            if !(50.0..=5_000.0).contains(&frequency) {
                continue;
            }
            let midi = (69.0 + 12.0 * (frequency / 440.0).log2()).round() as i32;
            chroma[midi.rem_euclid(12) as usize] += f64::from(value.norm_sqr());
        }
        frames += 1;
    }
    if frames == 0 || chroma.iter().sum::<f64>() <= 0.0 {
        return failed_key("key_not_detected");
    }
    const MAJOR: [f64; 12] = [
        6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
    ];
    const MINOR: [f64; 12] = [
        6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
    ];
    let mut candidates = Vec::with_capacity(24);
    for root in 0..12 {
        candidates.push((correlation(&chroma, &MAJOR, root), root, false));
        candidates.push((correlation(&chroma, &MINOR, root), root, true));
    }
    candidates.sort_by(|a, b| b.0.total_cmp(&a.0));
    let best = candidates[0];
    let confidence = (((best.0 + 1.0) / 2.0).clamp(0.0, 1.0) * 0.35
        + ((best.0 - candidates[1].0) / 0.2).clamp(0.0, 1.0) * 0.65)
        .clamp(0.0, 1.0);
    let (key, camelot) = key_names(best.1, best.2);
    (
        AnalysisField::completed(key.into(), confidence),
        AnalysisField::completed(camelot.into(), confidence),
    )
}

fn correlation(chroma: &[f64; 12], profile: &[f64; 12], root: usize) -> f64 {
    let cm = chroma.iter().sum::<f64>() / 12.0;
    let pm = profile.iter().sum::<f64>() / 12.0;
    let mut numerator = 0.0;
    let mut cp = 0.0;
    let mut pp = 0.0;
    for i in 0..12 {
        let a = chroma[i] - cm;
        let b = profile[(i + 12 - root) % 12] - pm;
        numerator += a * b;
        cp += a * a;
        pp += b * b;
    }
    numerator / (cp * pp).sqrt().max(1e-9)
}

fn key_names(root: usize, minor: bool) -> (&'static str, &'static str) {
    const MAJOR: [(&str, &str); 12] = [
        ("C", "8B"),
        ("D♭", "3B"),
        ("D", "10B"),
        ("E♭", "5B"),
        ("E", "12B"),
        ("F", "7B"),
        ("F♯", "2B"),
        ("G", "9B"),
        ("A♭", "4B"),
        ("A", "11B"),
        ("B♭", "6B"),
        ("B", "1B"),
    ];
    const MINOR: [(&str, &str); 12] = [
        ("Cm", "5A"),
        ("C♯m", "12A"),
        ("Dm", "7A"),
        ("D♯m", "2A"),
        ("Em", "9A"),
        ("Fm", "4A"),
        ("F♯m", "11A"),
        ("Gm", "6A"),
        ("G♯m", "1A"),
        ("Am", "8A"),
        ("A♯m", "3A"),
        ("Bm", "10A"),
    ];
    if minor {
        MINOR[root]
    } else {
        MAJOR[root]
    }
}

fn failed_key(code: &'static str) -> (AnalysisField<String>, AnalysisField<String>) {
    (AnalysisField::failed(code), AnalysisField::failed(code))
}
fn round3(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

#[cfg(test)]
pub(crate) fn test_analysis() -> TrackAnalysis {
    TrackAnalysis {
        bpm: AnalysisField::completed(128.0, 0.8),
        musical_key: AnalysisField::completed("Am".into(), 0.7),
        camelot_key: AnalysisField::completed("8A".into(), 0.7),
        energy: AnalysisField::completed(7, 1.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn returns_valid_per_field_results_from_one_pcm_buffer() {
        let rate = 8_000;
        let samples: Vec<f32> = (0..rate * 10)
            .map(|i| {
                let tone = (i as f32 * 440.0 * std::f32::consts::TAU / rate as f32).sin() * 0.2;
                let pulse = if i % (rate / 2) < 200 { 0.7 } else { 0.0 };
                tone + pulse
            })
            .collect();
        let result = analyze_samples(&samples, rate, &AtomicBool::new(false));
        assert_eq!(result.energy.status, "completed");
        assert!(result.energy.value.unwrap() <= 10);
        assert_eq!(result.bpm.status, "completed");
        assert_eq!(result.musical_key.status, "completed");
        assert_eq!(result.camelot_key.status, "completed");
    }
    #[test]
    fn field_failures_are_independent() {
        let result = analyze_samples(&[0.5; 4096], 44_100, &AtomicBool::new(false));
        assert_eq!(result.energy.status, "completed");
        assert_eq!(result.bpm.status, "failed");
    }
    #[test]
    fn cancellation_is_observed_between_fields() {
        let cancelled = AtomicBool::new(true);
        let result = analyze_samples(&[0.5; 4096], 44_100, &cancelled);
        assert_eq!(result.bpm.error, Some("analysis_cancelled"));
        assert_eq!(result.musical_key.error, Some("analysis_cancelled"));
    }
}
