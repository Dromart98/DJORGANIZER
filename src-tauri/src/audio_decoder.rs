use std::io;

use symphonia::core::{
    codecs::audio::{AudioDecoder, AudioDecoderOptions},
    errors::Error as SymphoniaError,
    formats::{probe::Hint, FormatOptions, FormatReader, Track, TrackType},
    io::{MediaSource, MediaSourceStream},
    meta::MetadataOptions,
};

const INVALID_SOURCE: &str = "invalid_source";
const UNRECOGNIZED_FORMAT: &str = "unrecognized_format";
const NO_AUDIO_TRACK: &str = "no_audio_track";
const INVALID_SAMPLE_RATE: &str = "invalid_sample_rate";
const INVALID_CHANNELS: &str = "invalid_channels";
const DECODE_FAILED: &str = "decode_failed";
const NON_FINITE_SAMPLE: &str = "non_finite_sample";

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
    if max_samples == 0 || source.byte_len() == Some(0) {
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
    let mut output = Vec::with_capacity(max_samples.min(32_768));
    let mut sample_rate = None;

    loop {
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
        let rate = decoded.spec().rate();
        let channels = decoded.spec().channels().count();
        validate_audio_metadata(rate, channels)?;
        if sample_rate.replace(rate).is_some_and(|known| known != rate) {
            return Err(AudioDecodeError::new(INVALID_SAMPLE_RATE));
        }

        let mut interleaved = vec![0.0_f32; decoded.samples_interleaved()];
        decoded.copy_to_slice_interleaved(&mut interleaved);
        append_mono(&interleaved, channels, max_samples, &mut output)?;
        if output.len() == max_samples {
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

fn map_probe_error(error: SymphoniaError) -> AudioDecodeError {
    match error {
        SymphoniaError::IoError(ref error) if error.kind() != io::ErrorKind::UnexpectedEof => {
            AudioDecodeError::new(INVALID_SOURCE)
        }
        _ => AudioDecodeError::new(UNRECOGNIZED_FORMAT),
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
) -> Result<(), AudioDecodeError> {
    validate_audio_metadata(1, channels)?;
    if interleaved.len() % channels != 0 {
        return Err(AudioDecodeError::new(DECODE_FAILED));
    }

    for frame in interleaved.chunks_exact(channels) {
        if output.len() == limit {
            break;
        }
        let mut sum = 0.0_f64;
        for &sample in frame {
            if !sample.is_finite() {
                return Err(AudioDecodeError::new(NON_FINITE_SAMPLE));
            }
            sum += f64::from(sample);
        }
        let mono = (sum / channels as f64) as f32;
        if !mono.is_finite() {
            return Err(AudioDecodeError::new(NON_FINITE_SAMPLE));
        }
        output.push(mono);
    }
    Ok(())
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
    fn rejects_empty_and_unrecognized_sources() {
        assert_eq!(decode(Vec::new(), 10).unwrap_err().code, INVALID_SOURCE);
        assert_eq!(
            decode(b"not audio".to_vec(), 10).unwrap_err().code,
            UNRECOGNIZED_FORMAT
        );
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
    fn detects_compressed_flac_from_content_without_an_extension_hint() {
        let encoded = include_str!("../tests/fixtures/audio-decoder-sine.flac.b64");
        let result = decode(STANDARD.decode(encoded.trim()).unwrap(), 2_000).unwrap();
        assert_eq!(result.sample_rate, 8_000);
        assert!(!result.samples.is_empty());
        assert!(result.samples.iter().all(|sample| sample.is_finite()));
    }
}
