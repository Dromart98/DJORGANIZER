use std::io;
use std::sync::atomic::{AtomicBool, Ordering};

use symphonia::core::{
    codecs::audio::{AudioDecoder, AudioDecoderOptions},
    errors::Error as SymphoniaError,
    formats::{probe::Hint, FormatOptions, FormatReader, SeekMode, SeekTo, Track, TrackType},
    io::{MediaSource, MediaSourceStream},
    meta::MetadataOptions,
    units::Time,
    units::TimeBase,
};

const INVALID_SOURCE: &str = "invalid_source";
const UNRECOGNIZED_FORMAT: &str = "unrecognized_format";
const NO_AUDIO_TRACK: &str = "no_audio_track";
const INVALID_SAMPLE_RATE: &str = "invalid_sample_rate";
const INVALID_CHANNELS: &str = "invalid_channels";
const DECODE_FAILED: &str = "decode_failed";
const NON_FINITE_SAMPLE: &str = "non_finite_sample";
const SEEK_UNSUPPORTED: &str = "seek_unsupported";
pub(crate) const DECODE_CANCELLED: &str = "decode_cancelled";
const MAX_SAFE_SEEK_PREROLL_SECONDS: usize = 1;

#[derive(Debug, PartialEq)]
pub(crate) struct DecodedAudio {
    pub(crate) samples: Vec<f32>,
    pub(crate) sample_rate: u32,
    pub(crate) truncated: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct AudioDecodeError {
    pub(crate) code: &'static str,
}

impl AudioDecodeError {
    fn new(code: &'static str) -> Self {
        Self { code }
    }
}

/// Decodes trusted local media by inspecting its bytes. Metadata tags remain Lofty's responsibility.
pub(crate) fn decode_audio(
    source: Box<dyn MediaSource>,
    max_samples: usize,
) -> Result<DecodedAudio, AudioDecodeError> {
    if max_samples == 0 {
        return Err(AudioDecodeError::new(INVALID_SOURCE));
    }

    decode_audio_with_rate_limit(source, move |_| Ok(max_samples))
}

/// Decodes with a limit derived once from the validated sample rate of the first audio packet.
pub(crate) fn decode_audio_with_rate_limit<F>(
    source: Box<dyn MediaSource>,
    limit_for_rate: F,
) -> Result<DecodedAudio, AudioDecodeError>
where
    F: FnOnce(u32) -> Result<usize, &'static str>,
{
    decode_audio_window_with_rate_limit(source, Time::ZERO, limit_for_rate)
}

/// Decodes one bounded window after an accurate container seek. The seek target is trusted native
/// metadata, never an IPC value. Samples decoded before the exact target are discarded.
pub(crate) fn decode_audio_window_with_rate_limit<F>(
    source: Box<dyn MediaSource>,
    offset: Time,
    limit_for_rate: F,
) -> Result<DecodedAudio, AudioDecodeError>
where
    F: FnOnce(u32) -> Result<usize, &'static str>,
{
    decode_audio_window_with_rate_limit_and_cancel(source, offset, limit_for_rate, None)
}

pub(crate) fn decode_audio_window_with_rate_limit_and_cancel<F>(
    source: Box<dyn MediaSource>,
    offset: Time,
    limit_for_rate: F,
    cancelled: Option<&AtomicBool>,
) -> Result<DecodedAudio, AudioDecodeError>
where
    F: FnOnce(u32) -> Result<usize, &'static str>,
{
    let check_cancelled = || {
        cancelled
            .is_some_and(|flag| flag.load(Ordering::Acquire))
            .then(|| AudioDecodeError::new(DECODE_CANCELLED))
            .map_or(Ok(()), Err)
    };
    check_cancelled()?;
    if source.byte_len() == Some(0) {
        return Err(AudioDecodeError::new(INVALID_SOURCE));
    }

    let stream = MediaSourceStream::new(source, Default::default());
    let mut format = symphonia::default::get_probe()
        .probe(
            &Hint::new(),
            stream,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(map_probe_error)?;

    let (track_id, mut decoder) = select_audio_track(format.as_ref())?;
    let mut seek_preroll = None;
    if offset != Time::ZERO {
        let seeked = format
            .seek(
                SeekMode::Accurate,
                SeekTo::Time {
                    time: offset,
                    track_id: Some(track_id),
                },
            )
            .map_err(map_seek_error)?;
        decoder.reset();
        let time_base = format
            .tracks()
            .iter()
            .find(|track| track.id == track_id)
            .and_then(|track| track.time_base)
            .ok_or_else(|| AudioDecodeError::new(SEEK_UNSUPPORTED))?;
        let ticks = seeked
            .required_ts
            .get()
            .checked_sub(seeked.actual_ts.get())
            .filter(|ticks| *ticks >= 0)
            .ok_or_else(|| AudioDecodeError::new(SEEK_UNSUPPORTED))?;
        seek_preroll = Some((ticks as u64, time_base));
    }
    let mut output = Vec::new();
    let mut sample_rate = None;
    let mut max_samples = None;
    let mut limit_for_rate = Some(limit_for_rate);

    loop {
        // Packet boundaries are cheap, bounded cooperative cancellation points.
        check_cancelled()?;
        let packet = match format.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            Err(_) => return Err(AudioDecodeError::new(DECODE_FAILED)),
        };
        if packet.track_id != track_id {
            continue;
        }

        let decoded = decoder
            .decode(&packet)
            .map_err(|_| AudioDecodeError::new(DECODE_FAILED))?;
        check_cancelled()?;
        let rate = decoded.spec().rate();
        let channels = decoded.spec().channels().count();
        validate_audio_metadata(rate, channels)?;
        let mut frames_to_skip = match seek_preroll.take() {
            Some((ticks, time_base)) => frames_for_seek_preroll(ticks, time_base, rate)?,
            None => 0,
        };
        if frames_to_skip > rate as usize * MAX_SAFE_SEEK_PREROLL_SECONDS {
            return Err(AudioDecodeError::new(SEEK_UNSUPPORTED));
        }
        if sample_rate.replace(rate).is_some_and(|known| known != rate) {
            return Err(AudioDecodeError::new(INVALID_SAMPLE_RATE));
        }
        let limit = match max_samples {
            Some(limit) => limit,
            None => {
                let limit =
                    limit_for_rate
                        .take()
                        .expect("sample limit policy is evaluated once")(rate)
                    .map_err(AudioDecodeError::new)?;
                if limit == 0 {
                    return Err(AudioDecodeError::new(INVALID_SOURCE));
                }
                output
                    .try_reserve_exact(limit.min(32_768))
                    .map_err(|_| AudioDecodeError::new(DECODE_FAILED))?;
                max_samples = Some(limit);
                limit
            }
        };

        let mut interleaved = vec![0.0_f32; decoded.samples_interleaved()];
        decoded.copy_to_slice_interleaved(&mut interleaved);
        if frames_to_skip != 0 {
            let packet_frames = interleaved.len() / channels;
            let skipped = frames_to_skip.min(packet_frames);
            frames_to_skip -= skipped;
            if frames_to_skip != 0 {
                seek_preroll = Some((
                    frames_to_skip as u64,
                    TimeBase::try_from_recip(rate)
                        .ok_or_else(|| AudioDecodeError::new(INVALID_SAMPLE_RATE))?,
                ));
            }
            interleaved.drain(..skipped * channels);
            if interleaved.is_empty() {
                continue;
            }
        }
        if append_mono(&interleaved, channels, limit, &mut output)? {
            return Ok(DecodedAudio {
                samples: output,
                sample_rate: rate,
                truncated: true,
            });
        }
    }

    Ok(DecodedAudio {
        samples: output,
        sample_rate: sample_rate.ok_or_else(|| AudioDecodeError::new(DECODE_FAILED))?,
        truncated: false,
    })
}

fn frames_for_seek_preroll(
    ticks: u64,
    time_base: TimeBase,
    sample_rate: u32,
) -> Result<usize, AudioDecodeError> {
    let numerator = u128::from(ticks)
        .checked_mul(u128::from(time_base.numer.get()))
        .and_then(|value| value.checked_mul(u128::from(sample_rate)))
        .ok_or_else(|| AudioDecodeError::new(DECODE_FAILED))?;
    let denominator = u128::from(time_base.denom.get());
    let frames = numerator
        .checked_add(denominator - 1)
        .map(|value| value / denominator)
        .and_then(|value| usize::try_from(value).ok())
        .ok_or_else(|| AudioDecodeError::new(DECODE_FAILED))?;
    Ok(frames)
}

fn map_probe_error(error: SymphoniaError) -> AudioDecodeError {
    match error {
        SymphoniaError::IoError(ref error) if error.kind() != io::ErrorKind::UnexpectedEof => {
            AudioDecodeError::new(INVALID_SOURCE)
        }
        _ => AudioDecodeError::new(UNRECOGNIZED_FORMAT),
    }
}

fn map_seek_error(error: SymphoniaError) -> AudioDecodeError {
    match error {
        SymphoniaError::SeekError(_) | SymphoniaError::Unsupported(_) => {
            AudioDecodeError::new(SEEK_UNSUPPORTED)
        }
        SymphoniaError::IoError(_)
        | SymphoniaError::DecodeError(_)
        | SymphoniaError::LimitError(_)
        | SymphoniaError::ResetRequired => AudioDecodeError::new(DECODE_FAILED),
        _ => AudioDecodeError::new(DECODE_FAILED),
    }
}

fn select_audio_track(
    format: &dyn FormatReader,
) -> Result<(u32, Box<dyn AudioDecoder>), AudioDecodeError> {
    select_audio_track_from_tracks(format.tracks())
}

fn select_audio_track_from_tracks(
    available_tracks: &[Track],
) -> Result<(u32, Box<dyn AudioDecoder>), AudioDecodeError> {
    let mut tracks: Vec<&Track> = available_tracks
        .iter()
        .filter(|track| track.track_type() == Some(TrackType::Audio))
        .collect();
    tracks.sort_by_key(|track| track.id);

    for track in tracks {
        let Some(params) = track
            .codec_params
            .as_ref()
            .and_then(|params| params.audio())
        else {
            continue;
        };
        if let Ok(decoder) = symphonia::default::get_codecs()
            .make_audio_decoder(params, &AudioDecoderOptions::default())
        {
            return Ok((track.id, decoder));
        }
    }
    Err(AudioDecodeError::new(NO_AUDIO_TRACK))
}

fn validate_audio_metadata(sample_rate: u32, channels: usize) -> Result<(), AudioDecodeError> {
    if sample_rate == 0 {
        return Err(AudioDecodeError::new(INVALID_SAMPLE_RATE));
    }
    if channels == 0 {
        return Err(AudioDecodeError::new(INVALID_CHANNELS));
    }
    Ok(())
}

fn append_mono(
    interleaved: &[f32],
    channels: usize,
    limit: usize,
    output: &mut Vec<f32>,
) -> Result<bool, AudioDecodeError> {
    validate_audio_metadata(1, channels)?;
    if interleaved.len() % channels != 0 {
        return Err(AudioDecodeError::new(DECODE_FAILED));
    }

    for frame in interleaved.chunks_exact(channels) {
        if output.len() == limit {
            validate_finite_frame(frame)?;
            return Ok(true);
        }
        let sum = validate_finite_frame(frame)?;
        let mono = (sum / channels as f64) as f32;
        if !mono.is_finite() {
            return Err(AudioDecodeError::new(NON_FINITE_SAMPLE));
        }
        output.push(mono);
    }
    Ok(false)
}

fn validate_finite_frame(frame: &[f32]) -> Result<f64, AudioDecodeError> {
    let mut sum = 0.0_f64;
    for &sample in frame {
        if !sample.is_finite() {
            return Err(AudioDecodeError::new(NON_FINITE_SAMPLE));
        }
        sum += f64::from(sample);
    }
    Ok(sum)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use std::io::Cursor;

    fn wav(format: u16, channels: u16, rate: u32, bits: u16, data: &[u8]) -> Vec<u8> {
        let mut out = b"RIFF".to_vec();
        out.extend_from_slice(&(36_u32 + data.len() as u32).to_le_bytes());
        out.extend_from_slice(b"WAVEfmt ");
        out.extend_from_slice(&16_u32.to_le_bytes());
        out.extend_from_slice(&format.to_le_bytes());
        out.extend_from_slice(&channels.to_le_bytes());
        out.extend_from_slice(&rate.to_le_bytes());
        let align = channels * (bits / 8);
        out.extend_from_slice(&(rate * u32::from(align)).to_le_bytes());
        out.extend_from_slice(&align.to_le_bytes());
        out.extend_from_slice(&bits.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(data);
        out
    }

    fn decode(bytes: Vec<u8>, limit: usize) -> Result<DecodedAudio, AudioDecodeError> {
        decode_audio(Box::new(Cursor::new(bytes)), limit)
    }

    #[test]
    fn decodes_integer_pcm_mono_and_preserves_rate() {
        let data: Vec<u8> = [-32768_i16, 0, 16384]
            .into_iter()
            .flat_map(i16::to_le_bytes)
            .collect();
        let result = decode(wav(1, 1, 22_050, 16, &data), 10).unwrap();
        assert_eq!(result.sample_rate, 22_050);
        assert_eq!(result.samples, [-1.0, 0.0, 0.5]);
        assert!(!result.truncated);
    }

    #[test]
    fn decodes_float_pcm_and_downmixes_stereo_per_frame() {
        let data: Vec<u8> = [0.25_f32, 0.75, -1.0, 0.5]
            .into_iter()
            .flat_map(f32::to_le_bytes)
            .collect();
        let result = decode(wav(3, 2, 48_000, 32, &data), 10).unwrap();
        assert_eq!(result.samples, [0.5, -0.25]);
        assert_eq!(result.sample_rate, 48_000);
    }

    #[test]
    fn enforces_the_exact_output_limit() {
        let data: Vec<u8> = [0_i16, 1, 2, 3]
            .into_iter()
            .flat_map(i16::to_le_bytes)
            .collect();
        let result = decode(wav(1, 1, 8_000, 16, &data), 3).unwrap();
        assert_eq!(result.samples.len(), 3);
        assert!(result.truncated);
    }

    #[test]
    fn does_not_truncate_when_input_exactly_matches_the_limit() {
        let data: Vec<u8> = [0_i16, 1, 2]
            .into_iter()
            .flat_map(i16::to_le_bytes)
            .collect();
        let result = decode(wav(1, 1, 8_000, 16, &data), 3).unwrap();
        assert_eq!(result.samples.len(), 3);
        assert!(!result.truncated);
    }

    #[test]
    fn rejects_empty_and_unrecognized_sources() {
        assert_eq!(decode(Vec::new(), 10).unwrap_err().code, INVALID_SOURCE);
        assert_eq!(
            decode(b"not audio".to_vec(), 10).unwrap_err().code,
            UNRECOGNIZED_FORMAT
        );
    }

    #[test]
    fn cancellation_has_a_stable_code_before_decode_starts() {
        let cancelled = AtomicBool::new(true);
        let error = decode_audio_window_with_rate_limit_and_cancel(
            Box::new(Cursor::new(wav(1, 1, 8_000, 16, &[0, 0]))),
            Time::ZERO,
            |_| Ok(10),
            Some(&cancelled),
        )
        .unwrap_err();
        assert_eq!(error.code, DECODE_CANCELLED);
    }

    #[test]
    fn reports_invalid_metadata_stably() {
        let error = match select_audio_track_from_tracks(&[]) {
            Ok(_) => panic!("an empty track list must fail"),
            Err(error) => error,
        };
        assert_eq!(error.code, NO_AUDIO_TRACK);
        assert_eq!(
            validate_audio_metadata(0, 1).unwrap_err().code,
            INVALID_SAMPLE_RATE
        );
        assert_eq!(
            validate_audio_metadata(44_100, 0).unwrap_err().code,
            INVALID_CHANNELS
        );
    }

    #[test]
    fn rejects_non_finite_samples() {
        let mut output = Vec::new();
        assert_eq!(
            append_mono(&[f32::NAN], 1, 1, &mut output)
                .unwrap_err()
                .code,
            NON_FINITE_SAMPLE
        );
    }

    #[test]
    fn seek_preroll_uses_the_decoded_rate_and_never_rounds_before_the_target() {
        let time_base = TimeBase::try_new(1, 1_000).unwrap();
        // 1.01 frames proves ceil advances beyond the fractional requested offset.
        assert_eq!(frames_for_seek_preroll(101, time_base, 10).unwrap(), 2);
        assert_eq!((101_f64 / 1_000.0 * 10.0).round() as usize, 1);
    }

    #[test]
    fn seek_error_mapper_allows_fallback_only_for_positioning_capability_errors() {
        use symphonia::core::errors::SeekErrorKind;

        for error in [
            SymphoniaError::SeekError(SeekErrorKind::Unseekable),
            SymphoniaError::Unsupported("seek"),
        ] {
            assert_eq!(map_seek_error(error).code, SEEK_UNSUPPORTED);
        }
        for error in [
            SymphoniaError::DecodeError("corrupt"),
            SymphoniaError::IoError(io::Error::new(io::ErrorKind::UnexpectedEof, "stream")),
            SymphoniaError::LimitError("limit"),
            SymphoniaError::ResetRequired,
        ] {
            assert_eq!(map_seek_error(error).code, DECODE_FAILED);
        }
    }

    #[test]
    fn detects_compressed_flac_from_content_without_an_extension_hint() {
        let encoded = include_str!("../tests/fixtures/audio-decoder-sine.flac.b64");
        let result = decode(STANDARD.decode(encoded.trim()).unwrap(), 2_000).unwrap();
        assert_eq!(result.sample_rate, 8_000);
        assert!(!result.samples.is_empty());
        assert!(result.samples.iter().all(|sample| sample.is_finite()));
    }
}
