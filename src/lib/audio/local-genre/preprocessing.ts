export const LOCAL_GENRE_SAMPLE_RATE = 16_000 as const;
export const FRAME_SIZE = 512;
export const FRAME_HOP = 256;
export const MEL_BANDS = 96;
export const PATCH_FRAMES = 128;
export const PATCH_HOP = 62;
export const FIXED_BATCH_SIZE = 64;

const NYQUIST = LOCAL_GENRE_SAMPLE_RATE / 2;
const SPECTRUM_BINS = FRAME_SIZE / 2 + 1;

function hzToSlaneyMel(hz: number) {
  const linearSlope = 3 / 200;
  if (hz < 1_000) return hz * linearSlope;
  const minimumLogMel = 1_000 * linearSlope;
  const logStep = Math.log(6.4) / 27;
  return minimumLogMel + Math.log(hz / 1_000) / logStep;
}

function slaneyMelToHz(mel: number) {
  const linearSlope = 3 / 200;
  const minimumLogMel = 1_000 * linearSlope;
  if (mel < minimumLogMel) return mel / linearSlope;
  const logStep = Math.log(6.4) / 27;
  return 1_000 * Math.exp((mel - minimumLogMel) * logStep);
}

export function createMelFilterBank() {
  const lowMel = hzToSlaneyMel(0);
  const highMel = hzToSlaneyMel(NYQUIST);
  const increment = (highMel - lowMel) / (MEL_BANDS + 1);
  const frequencies = Array.from({ length: MEL_BANDS + 2 }, (_, index) =>
    slaneyMelToHz(lowMel + increment * index),
  );
  const frequencyScale = NYQUIST / (SPECTRUM_BINS - 1);
  return Array.from({ length: MEL_BANDS }, (_, bandIndex) => {
    const coefficients = new Float32Array(SPECTRUM_BINS);
    const left = frequencies[bandIndex];
    const center = frequencies[bandIndex + 1];
    const right = frequencies[bandIndex + 2];
    const normalization = (center - left + right - center) / 2;
    const firstBin = Math.ceil(left / frequencyScale);
    const lastBin = Math.floor(right / frequencyScale);
    for (let bin = firstBin; bin <= lastBin; bin += 1) {
      const frequency = bin * frequencyScale;
      const weight =
        frequency < center
          ? (frequency - left) / (center - left)
          : (right - frequency) / (right - center);
      coefficients[bin] = weight / normalization;
    }
    return coefficients;
  });
}

const HANN_WINDOW = Float32Array.from(
  { length: FRAME_SIZE },
  (_, index) =>
    0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FRAME_SIZE - 1)),
);
const MEL_FILTER_BANK = createMelFilterBank();

function magnitudeSpectrum(frame: Float32Array) {
  const real = Float64Array.from(frame, (value, index) => value * HANN_WINDOW[index]);
  const imaginary = new Float64Array(FRAME_SIZE);
  for (let index = 1, target = 0; index < FRAME_SIZE; index += 1) {
    let bit = FRAME_SIZE >> 1;
    for (; target & bit; bit >>= 1) target ^= bit;
    target ^= bit;
    if (index < target) {
      [real[index], real[target]] = [real[target], real[index]];
    }
  }
  for (let length = 2; length <= FRAME_SIZE; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < FRAME_SIZE; start += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddReal =
          real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary =
          real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary =
          twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
  return Float32Array.from({ length: SPECTRUM_BINS }, (_, index) =>
    Math.hypot(real[index], imaginary[index]),
  );
}

export function computeMusiCnnFrames(pcm: Float32Array) {
  if (!pcm.length) throw new Error("El archivo de audio está vacío.");
  const frameCount = Math.max(
    1,
    1 + Math.ceil((pcm.length - FRAME_SIZE / 2) / FRAME_HOP),
  );
  const features = new Float32Array(frameCount * MEL_BANDS);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const frame = new Float32Array(FRAME_SIZE);
    const start = frameIndex * FRAME_HOP - FRAME_SIZE / 2;
    for (let offset = 0; offset < FRAME_SIZE; offset += 1) {
      const sourceIndex = start + offset;
      if (sourceIndex >= 0 && sourceIndex < pcm.length) {
        frame[offset] = pcm[sourceIndex];
      }
    }
    const spectrum = magnitudeSpectrum(frame);
    for (let bandIndex = 0; bandIndex < MEL_BANDS; bandIndex += 1) {
      let energy = 0;
      const filter = MEL_FILTER_BANK[bandIndex];
      for (let bin = 0; bin < SPECTRUM_BINS; bin += 1) {
        energy += spectrum[bin] * spectrum[bin] * filter[bin];
      }
      features[frameIndex * MEL_BANDS + bandIndex] = Math.log10(
        1 + 10_000 * energy,
      );
    }
  }
  return { features, frameCount };
}

export function createPatches(features: Float32Array, frameCount: number) {
  if (features.length !== frameCount * MEL_BANDS) {
    throw new Error("Las características locales tienen una forma inesperada.");
  }
  const patchCount =
    frameCount < PATCH_FRAMES
      ? 0
      : 1 + Math.floor((frameCount - PATCH_FRAMES) / PATCH_HOP);
  if (!patchCount) {
    throw new Error("El audio es demasiado corto para sugerir un género.");
  }
  const patches = new Float32Array(patchCount * PATCH_FRAMES * MEL_BANDS);
  const patchSize = PATCH_FRAMES * MEL_BANDS;
  for (let patchIndex = 0; patchIndex < patchCount; patchIndex += 1) {
    const sourceStart = patchIndex * PATCH_HOP * MEL_BANDS;
    patches.set(features.subarray(sourceStart, sourceStart + patchSize), patchIndex * patchSize);
  }
  return { patchCount, patches };
}

export function createFixedBatches(patches: Float32Array, patchCount: number) {
  const patchSize = PATCH_FRAMES * MEL_BANDS;
  if (patches.length !== patchCount * patchSize) {
    throw new Error("Los parches locales tienen una forma inesperada.");
  }
  const batches: Array<{ actualPatches: number; values: Float32Array }> = [];
  for (let start = 0; start < patchCount; start += FIXED_BATCH_SIZE) {
    const actualPatches = Math.min(FIXED_BATCH_SIZE, patchCount - start);
    const values = new Float32Array(FIXED_BATCH_SIZE * patchSize);
    values.set(patches.subarray(start * patchSize, (start + actualPatches) * patchSize));
    batches.push({ actualPatches, values });
  }
  return batches;
}
