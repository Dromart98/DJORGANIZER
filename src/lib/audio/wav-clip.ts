const MAX_CLIP_SECONDS = 45;

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function encodeMonoPcm16Wav(
  samples: ArrayLike<number>,
  sampleRate: number,
) {
  if (!Number.isFinite(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) {
    throw new Error("La frecuencia de muestreo no es válida.");
  }
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, Number(samples[index]) || 0));
    view.setInt16(
      44 + index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return bytes;
}

export function createWavClipFromAudioBuffer(
  audioBuffer: AudioBuffer,
  maxSeconds = MAX_CLIP_SECONDS,
) {
  const frameCount = Math.min(
    audioBuffer.length,
    Math.floor(audioBuffer.sampleRate * maxSeconds),
  );
  const startFrame = Math.max(
    0,
    Math.floor((audioBuffer.length - frameCount) * 0.35),
  );
  const mono = new Float32Array(frameCount);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const samples = audioBuffer.getChannelData(channel);
    for (let frame = 0; frame < frameCount; frame += 1) {
      mono[frame] += samples[startFrame + frame] / audioBuffer.numberOfChannels;
    }
  }
  return new Blob([encodeMonoPcm16Wav(mono, audioBuffer.sampleRate)], {
    type: "audio/wav",
  });
}
