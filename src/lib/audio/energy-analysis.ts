const EPSILON = 1e-9;

export type EnergyAnalysis = {
  confidence: number;
  crestDb: number;
  energy: number;
  rmsDb: number;
  zeroCrossingRate: number;
};

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function analyzeEnergySamples(
  samples: ArrayLike<number>,
  sampleRate: number,
): EnergyAnalysis {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || samples.length === 0) {
    throw new Error("No hay audio suficiente para calcular la energía.");
  }

  let sumSquares = 0;
  let peak = 0;
  let crossings = 0;
  let previous = Number(samples[0]) || 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = clamp(Number(samples[index]) || 0, -1, 1);
    sumSquares += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
    if (index > 0 && (sample >= 0) !== (previous >= 0)) crossings += 1;
    previous = sample;
  }

  const rms = Math.sqrt(sumSquares / samples.length);
  const rmsDb = 20 * Math.log10(Math.max(rms, EPSILON));
  const crestDb = 20 * Math.log10(Math.max(peak / Math.max(rms, EPSILON), 1));
  const zeroCrossingRate = crossings / Math.max(1, samples.length - 1);

  // La fórmula conserva resolución interna 0–100 y normaliza el contrato a 0–10:
  // 72 % sonoridad RMS (-60 a -6 dBFS), 18 % densidad espectral aproximada
  // mediante cruces por cero y 10 % compresión/transitorios mediante crest factor.
  const loudness = clamp(((rmsDb + 60) / 54) * 100);
  const density = clamp((zeroCrossingRate / 0.22) * 100);
  const compression = 100 - clamp((crestDb / 20) * 100);
  const highResolutionEnergy = clamp(
    loudness * 0.72 + density * 0.18 + compression * 0.1,
  );
  const energy = Math.round(highResolutionEnergy / 10);
  const seconds = samples.length / sampleRate;
  const confidence = Math.round(clamp((seconds / 30) * 100)) / 100;

  return {
    confidence,
    crestDb: Math.round(crestDb * 100) / 100,
    energy,
    rmsDb: Math.round(rmsDb * 100) / 100,
    zeroCrossingRate: Math.round(zeroCrossingRate * 10_000) / 10_000,
  };
}

export function analyzeEnergyFromAudioBuffer(audioBuffer: AudioBuffer) {
  const seconds = Math.min(audioBuffer.duration, 90);
  const length = Math.max(1, Math.floor(seconds * audioBuffer.sampleRate));
  const mono = new Float32Array(length);

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    const limit = Math.min(length, data.length);
    for (let index = 0; index < limit; index += 1) {
      mono[index] += data[index] / audioBuffer.numberOfChannels;
    }
  }

  return analyzeEnergySamples(mono, audioBuffer.sampleRate);
}
