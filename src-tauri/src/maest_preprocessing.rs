//! Pure PCM-to-Mel preprocessing for the fixed MAEST input contract.

use rustfft::{num_complex::Complex32, Fft, FftPlanner};
use std::sync::Arc;

use crate::maest::{AnalysisError, INPUT_BANDS, INPUT_FRAMES};

const FRAME_SIZE: usize = 512;
const HOP_SIZE: usize = 256;
const SPECTRUM_SIZE: usize = FRAME_SIZE / 2 + 1;
const REQUIRED_SAMPLES: usize = (INPUT_FRAMES - 1) * HOP_SIZE;
const MEAN: f32 = 2.067_556_9;
const POST_SCALE: f32 = 1.0 / (1.268_292_8 * 2.0);

fn preprocessing_error(code: &str, message: &str) -> AnalysisError {
    AnalysisError {
        code: code.into(),
        message: message.into(),
    }
}

struct MelFilter {
    start_bin: usize,
    weights: Vec<f32>,
}

struct MaestPreprocessor {
    fft: Arc<dyn Fft<f32>>,
    window: [f32; FRAME_SIZE],
    filters: Vec<MelFilter>,
    fft_buffer: Vec<Complex32>,
    spectrum: [f32; SPECTRUM_SIZE],
}

impl MaestPreprocessor {
    fn new() -> Self {
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(FRAME_SIZE);
        let window = std::array::from_fn(|index| {
            (0.5_f64 - 0.5 * (2.0 * std::f64::consts::PI * index as f64 / 511.0).cos()) as f32
        });
        Self {
            fft,
            window,
            filters: mel_filters(),
            fft_buffer: vec![Complex32::default(); FRAME_SIZE],
            spectrum: [0.0; SPECTRUM_SIZE],
        }
    }

    fn process_frame(&mut self, pcm: &[f32], frame_index: usize, output: &mut [f32]) {
        let frame_start = frame_index as isize * HOP_SIZE as isize - HOP_SIZE as isize;
        for window_index in 0..FRAME_SIZE {
            let sample_index = frame_start + window_index as isize;
            let sample = if sample_index < 0 || sample_index >= pcm.len() as isize {
                0.0
            } else {
                pcm[sample_index as usize]
            };
            // Essentia's default zero-phase window rotates the windowed frame by half a frame.
            let fft_index = (window_index + HOP_SIZE) % FRAME_SIZE;
            self.fft_buffer[fft_index] = Complex32::new(sample * self.window[window_index], 0.0);
        }
        self.fft.process(&mut self.fft_buffer);
        for (magnitude, value) in self
            .spectrum
            .iter_mut()
            .zip(self.fft_buffer.iter().take(SPECTRUM_SIZE))
        {
            *magnitude = value.norm();
        }

        for (band, filter) in output.iter_mut().zip(&self.filters) {
            let energy = filter
                .weights
                .iter()
                .enumerate()
                .map(|(offset, weight)| {
                    let magnitude = self.spectrum[filter.start_bin + offset];
                    magnitude * magnitude * weight
                })
                .sum::<f32>();
            let compressed = (1.0 + 10_000.0 * energy).log10();
            *band = (compressed - MEAN) * POST_SCALE;
        }
    }
}

fn hz_to_slaney_mel(hz: f32) -> f32 {
    if hz < 1_000.0 {
        hz * (3.0 / 200.0)
    } else {
        15.0 + (hz / 1_000.0).ln() / (6.4_f32.ln() / 27.0)
    }
}

fn slaney_mel_to_hz(mel: f32) -> f32 {
    if mel < 15.0 {
        mel / (3.0 / 200.0)
    } else {
        1_000.0 * ((mel - 15.0) * (6.4_f32.ln() / 27.0)).exp()
    }
}

fn mel_filters() -> Vec<MelFilter> {
    let max_mel = hz_to_slaney_mel(8_000.0);
    let increment = max_mel / (INPUT_BANDS + 1) as f32;
    let mut mel = 0.0_f32;
    let frequencies: Vec<f32> = (0..INPUT_BANDS + 2)
        .map(|_| {
            let frequency = slaney_mel_to_hz(mel);
            mel += increment;
            frequency
        })
        .collect();
    let bin_hz = 16_000.0 / FRAME_SIZE as f32;

    (0..INPUT_BANDS)
        .map(|band| {
            let lower = frequencies[band];
            let center = frequencies[band + 1];
            let upper = frequencies[band + 2];
            let start_bin = (lower / bin_hz).ceil() as usize;
            let end_bin = (upper / bin_hz).floor() as usize;
            let triangle_area = (upper - lower) / 2.0;
            let weights = (start_bin..=end_bin)
                .map(|bin| {
                    let frequency = bin as f32 * bin_hz;
                    let triangle = if frequency < center {
                        (frequency - lower) / (center - lower)
                    } else {
                        (upper - frequency) / (upper - center)
                    };
                    triangle / triangle_area
                })
                .collect();
            MelFilter { start_bin, weights }
        })
        .collect()
}

/// Converts finite mono `f32` PCM sampled at 16 kHz into one flat MAEST patch.
pub fn preprocess_maest_pcm(pcm: &[f32]) -> Result<Vec<f32>, AnalysisError> {
    if pcm.is_empty() {
        return Err(preprocessing_error(
            "empty_audio",
            "La señal de audio está vacía.",
        ));
    }
    if pcm.iter().any(|sample| !sample.is_finite()) {
        return Err(preprocessing_error(
            "invalid_audio_value",
            "La señal de audio contiene valores no finitos.",
        ));
    }
    if pcm.len() < REQUIRED_SAMPLES {
        return Err(preprocessing_error(
            "audio_too_short",
            "La señal de audio no contiene un patch MAEST completo.",
        ));
    }

    let mut preprocessor = MaestPreprocessor::new();
    let mut output = vec![0.0; INPUT_FRAMES * INPUT_BANDS];
    for (frame_index, bands) in output.chunks_exact_mut(INPUT_BANDS).enumerate() {
        preprocessor.process_frame(pcm, frame_index, bands);
    }
    if output.iter().any(|value| !value.is_finite()) {
        return Err(preprocessing_error(
            "invalid_preprocessed_value",
            "El preprocesamiento produjo valores no finitos.",
        ));
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    fn deterministic_signal() -> Vec<f32> {
        let mut state = 0x1234_5678_u32;
        (0..REQUIRED_SAMPLES)
            .map(|_| {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                (((state >> 16) as i32 - 32_768) as f32 / 32_768.0) * 0.2
            })
            .collect()
    }

    #[test]
    fn returns_the_fixed_finite_shape_and_is_deterministic() {
        let signal = deterministic_signal();
        let first = preprocess_maest_pcm(&signal).unwrap();
        let second = preprocess_maest_pcm(&signal).unwrap();
        assert_eq!(first.len(), INPUT_FRAMES * INPUT_BANDS);
        assert!(first.iter().all(|value| value.is_finite()));
        assert_eq!(first, second);
    }

    #[test]
    fn silence_has_the_exact_normalized_floor() {
        let output = preprocess_maest_pcm(&vec![0.0; REQUIRED_SAMPLES]).unwrap();
        let expected = -MEAN * POST_SCALE;
        assert!(output.iter().all(|value| *value == expected));
    }

    #[test]
    fn rejects_invalid_inputs_with_stable_codes() {
        assert_eq!(preprocess_maest_pcm(&[]).unwrap_err().code, "empty_audio");
        assert_eq!(
            preprocess_maest_pcm(&vec![0.0; REQUIRED_SAMPLES - 1])
                .unwrap_err()
                .code,
            "audio_too_short"
        );
        let mut invalid = vec![0.0; REQUIRED_SAMPLES];
        invalid[42] = f32::NAN;
        assert_eq!(
            preprocess_maest_pcm(&invalid).unwrap_err().code,
            "invalid_audio_value"
        );
    }

    #[test]
    fn matches_the_official_essentia_reference() {
        const REFERENCE: &str =
            include_str!("../tests/fixtures/maest-preprocessing-essentia-b9fa6cb.bin.b64");
        const MAX_TOLERANCE: f32 = 2.0e-5;
        const MEAN_TOLERANCE: f64 = 1.0e-6;
        let encoded: String = REFERENCE.split_whitespace().collect();
        let reference = STANDARD.decode(encoded).unwrap();
        assert_eq!(
            reference.len(),
            INPUT_FRAMES * INPUT_BANDS * size_of::<f32>()
        );
        let expected: Vec<f32> = reference
            .chunks_exact(4)
            .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
            .collect();
        let actual = preprocess_maest_pcm(&deterministic_signal()).unwrap();
        assert_eq!(expected.len(), INPUT_FRAMES * INPUT_BANDS);
        let mut max_difference = 0.0_f32;
        let mut total_difference = 0.0_f64;
        for (actual, expected) in actual.iter().zip(&expected) {
            let difference = (actual - expected).abs();
            max_difference = max_difference.max(difference);
            total_difference += difference as f64;
        }
        let mean_difference = total_difference / actual.len() as f64;
        eprintln!(
            "Essentia equivalence: max_difference={max_difference:.9e}, mean_difference={mean_difference:.9e}"
        );
        assert!(max_difference <= MAX_TOLERANCE);
        assert!(mean_difference <= MEAN_TOLERANCE);
    }
}
