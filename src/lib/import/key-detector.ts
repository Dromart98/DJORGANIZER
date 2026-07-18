import { bpmAnalysisWindow } from "@/lib/import/bpm";
import { estimateMusicalKey } from "@/lib/music/key-detection";

const BUFFER_SIZE = 4096;
const HOP_SIZE = 8192;

export async function detectKeyFromFile(
  file: File,
  audioContext: AudioContext,
) {
  const audioBuffer = await audioContext.decodeAudioData(
    await file.arrayBuffer(),
  );
  const window = bpmAnalysisWindow(audioBuffer.duration);
  if (!window) {
    throw new Error("El archivo es demasiado corto para analizar su tonalidad.");
  }

  const Meyda = (await import("meyda")).default;
  Meyda.bufferSize = BUFFER_SIZE;
  Meyda.sampleRate = audioBuffer.sampleRate;

  const channel = audioBuffer.getChannelData(0);
  const start = Math.floor(window.offset * audioBuffer.sampleRate);
  const end = Math.min(
    channel.length,
    Math.floor((window.offset + window.duration) * audioBuffer.sampleRate),
  );
  const accumulated = Array(12).fill(0) as number[];
  let frames = 0;

  for (let offset = start; offset + BUFFER_SIZE <= end; offset += HOP_SIZE) {
    const chroma = Meyda.extract(
      "chroma",
      channel.subarray(offset, offset + BUFFER_SIZE),
    );
    if (!Array.isArray(chroma) || chroma.length !== 12) continue;
    const energy = chroma.reduce((sum, value) => sum + value, 0);
    if (energy <= 0) continue;
    for (let index = 0; index < 12; index += 1) {
      accumulated[index] += chroma[index] / energy;
    }
    frames += 1;
  }

  const result = frames ? estimateMusicalKey(accumulated) : null;
  if (!result) {
    throw new Error("El detector no devolvió una tonalidad válida.");
  }
  return result;
}

