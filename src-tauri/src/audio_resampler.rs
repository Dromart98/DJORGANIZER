use rubato::{audioadapter_buffers::direct::InterleavedSlice, Fft, FixedSync, Resampler};

const TARGET_SAMPLE_RATE: u32 = 16_000;
const EMPTY_INPUT: &str = "empty_input";
const INVALID_SAMPLE_RATE: &str = "invalid_sample_rate";
const INVALID_SAMPLE_LIMIT: &str = "invalid_sample_limit";
const NON_FINITE_SAMPLE: &str = "non_finite_sample";
const SIZE_OVERFLOW: &str = "size_overflow";
const RESAMPLER_FAILED: &str = "resampler_failed";

#[derive(Debug, PartialEq)]
pub(crate) struct ResampledAudio {
    pub(crate) samples: Vec<f32>,
    pub(crate) sample_rate: u32,
    pub(crate) truncated: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct AudioResampleError {
    pub(crate) code: &'static str,
}

impl AudioResampleError {
    fn new(code: &'static str) -> Self {
        Self { code }
    }
}

/// Resamples a complete, finite mono PCM clip to the fixed MAEST input rate.
pub(crate) fn resample_mono_to_16khz(
    input: &[f32],
    input_sample_rate: u32,
    max_output_samples: usize,
) -> Result<ResampledAudio, AudioResampleError> {
    validate_input(input, input_sample_rate, max_output_samples)?;

    if input_sample_rate == TARGET_SAMPLE_RATE {
        let output_len = input.len().min(max_output_samples);
        return Ok(ResampledAudio {
            samples: input[..output_len].to_vec(),
            sample_rate: TARGET_SAMPLE_RATE,
            truncated: input.len() > max_output_samples,
        });
    }

    let expected_output_len = expected_output_len(input.len(), input_sample_rate)?;
    let chunk_size = input.len().min(4_096);
    let mut resampler = Fft::<f32>::new(
        input_sample_rate as usize,
        TARGET_SAMPLE_RATE as usize,
        chunk_size,
        1,
        FixedSync::Input,
    )
    .map_err(|_| AudioResampleError::new(RESAMPLER_FAILED))?;

    // Rubato trims the FFT delay after a complete processing chunk. Padding very short clips
    // through that path also ensures their leading samples are not returned as startup silence.
    let processing_len = input.len().max(
        resampler
            .input_frames_next()
            .checked_add(1)
            .ok_or_else(|| AudioResampleError::new(SIZE_OVERFLOW))?,
    );
    let mut padded_input = Vec::new();
    let processing_input = if processing_len == input.len() {
        input
    } else {
        padded_input
            .try_reserve_exact(processing_len)
            .map_err(|_| AudioResampleError::new(SIZE_OVERFLOW))?;
        padded_input.extend_from_slice(input);
        padded_input.resize(processing_len, 0.0);
        &padded_input
    };

    let output_capacity = resampler.process_all_needed_output_len(processing_len);
    if output_capacity < expected_output_len {
        return Err(AudioResampleError::new(SIZE_OVERFLOW));
    }
    let input_adapter = InterleavedSlice::new(processing_input, 1, processing_len)
        .map_err(|_| AudioResampleError::new(RESAMPLER_FAILED))?;
    let mut output = vec![0.0_f32; output_capacity];
    let mut output_adapter = InterleavedSlice::new_mut(&mut output, 1, output_capacity)
        .map_err(|_| AudioResampleError::new(RESAMPLER_FAILED))?;
    let (_, produced) = resampler
        .process_all_into_buffer(&input_adapter, &mut output_adapter, processing_len, None)
        .map_err(|_| AudioResampleError::new(RESAMPLER_FAILED))?;
    if produced < expected_output_len {
        return Err(AudioResampleError::new(RESAMPLER_FAILED));
    }
    if output[..produced].iter().any(|sample| !sample.is_finite()) {
        return Err(AudioResampleError::new(RESAMPLER_FAILED));
    }
    output.truncate(expected_output_len.min(max_output_samples));

    Ok(ResampledAudio {
        samples: output,
        sample_rate: TARGET_SAMPLE_RATE,
        truncated: expected_output_len > max_output_samples,
    })
}

fn validate_input(
    input: &[f32],
    input_sample_rate: u32,
    max_output_samples: usize,
) -> Result<(), AudioResampleError> {
    if input.is_empty() {
        return Err(AudioResampleError::new(EMPTY_INPUT));
    }
    if input_sample_rate == 0 {
        return Err(AudioResampleError::new(INVALID_SAMPLE_RATE));
    }
    if max_output_samples == 0 {
        return Err(AudioResampleError::new(INVALID_SAMPLE_LIMIT));
    }
    if input.iter().any(|sample| !sample.is_finite()) {
        return Err(AudioResampleError::new(NON_FINITE_SAMPLE));
    }
    expected_output_len(input.len(), input_sample_rate)?;
    Ok(())
}

fn expected_output_len(
    input_len: usize,
    input_sample_rate: u32,
) -> Result<usize, AudioResampleError> {
    input_len
        .checked_mul(TARGET_SAMPLE_RATE as usize)
        .and_then(|scaled| scaled.checked_add(input_sample_rate as usize - 1))
        .map(|rounded| rounded / input_sample_rate as usize)
        .ok_or_else(|| AudioResampleError::new(SIZE_OVERFLOW))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::TAU;

    fn tone(rate: u32, frequency: f32, seconds: usize) -> Vec<f32> {
        (0..rate as usize * seconds)
            .map(|index| (TAU * frequency * index as f32 / rate as f32).sin() * 0.5)
            .collect()
    }

    fn resample(input: &[f32], rate: u32, limit: usize) -> ResampledAudio {
        resample_mono_to_16khz(input, rate, limit).unwrap()
    }

    #[test]
    fn sixteen_khz_is_an_exact_identity() {
        let input = [0.0, -0.75, 0.25, 1.0];
        let result = resample(&input, 16_000, input.len());
        assert_eq!(result.samples, input);
        assert_eq!(result.sample_rate, 16_000);
        assert!(!result.truncated);
    }

    #[test]
    fn resamples_supported_source_rates_to_coherent_lengths() {
        for rate in [44_100, 48_000, 8_000] {
            let input = tone(rate, 440.0, 1);
            let result = resample(&input, rate, 16_001);
            assert_eq!(result.samples.len(), 16_000, "source rate {rate}");
            assert!(result.samples.iter().all(|sample| sample.is_finite()));
            assert!(!result.truncated);
        }
    }

    #[test]
    fn conserves_synthetic_tone_frequency() {
        let result = resample(&tone(44_100, 440.0, 1), 44_100, 16_000);
        let crossings = result
            .samples
            .windows(2)
            .filter(|pair| pair[0] <= 0.0 && pair[1] > 0.0)
            .count();
        assert!((439..=441).contains(&crossings), "crossings: {crossings}");
    }

    #[test]
    fn complete_clip_processing_preserves_the_start_and_tail() {
        let input = vec![0.5_f32; 480];
        let result = resample(&input, 48_000, 160);
        assert!(result.samples[..16].iter().any(|sample| sample.abs() > 0.1));
        assert!(result.samples[144..]
            .iter()
            .any(|sample| sample.abs() > 0.1));
    }

    #[test]
    fn repeated_resampling_is_deterministic() {
        let input = tone(48_000, 997.0, 1);
        assert_eq!(
            resample(&input, 48_000, 16_000),
            resample(&input, 48_000, 16_000)
        );
    }

    #[test]
    fn exact_limit_is_not_truncated() {
        let result = resample(&[0.25; 8], 8_000, 16);
        assert_eq!(result.samples.len(), 16);
        assert!(!result.truncated);
    }

    #[test]
    fn additional_output_is_truncated_at_the_limit() {
        let result = resample(&[0.25; 9], 8_000, 16);
        assert_eq!(result.samples.len(), 16);
        assert!(result.truncated);
    }

    #[test]
    fn rejects_invalid_inputs_with_stable_codes() {
        assert_eq!(
            resample_mono_to_16khz(&[], 16_000, 1).unwrap_err().code,
            EMPTY_INPUT
        );
        assert_eq!(
            resample_mono_to_16khz(&[0.0], 0, 1).unwrap_err().code,
            INVALID_SAMPLE_RATE
        );
        assert_eq!(
            resample_mono_to_16khz(&[0.0], 16_000, 0).unwrap_err().code,
            INVALID_SAMPLE_LIMIT
        );
        for sample in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            assert_eq!(
                resample_mono_to_16khz(&[sample], 16_000, 1)
                    .unwrap_err()
                    .code,
                NON_FINITE_SAMPLE
            );
        }
    }

    #[test]
    fn reports_size_overflow_before_allocating() {
        assert_eq!(
            expected_output_len(usize::MAX, 1).unwrap_err().code,
            SIZE_OVERFLOW
        );
    }
}
