import {
  bpmAnalysisWindow,
  normalizeDetectedBpm,
} from "@/lib/import/bpm";

export async function detectBpmFromAudioBuffer(audioBuffer: AudioBuffer) {
  const window = bpmAnalysisWindow(audioBuffer.duration);

  if (!window) {
    throw new Error("El archivo es demasiado corto para analizar su BPM.");
  }

  const { analyze } = await import("web-audio-beat-detector");
  const tempo = await analyze(
    audioBuffer,
    window.offset,
    window.duration,
  );
  const bpm = normalizeDetectedBpm(tempo);

  if (bpm === null) {
    throw new Error("El detector no devolvió un BPM válido.");
  }

  return bpm;
}


export async function detectBpmFromFile(
  file: File,
  audioContext: AudioContext,
) {
  const audioBuffer = await audioContext.decodeAudioData(
    await file.arrayBuffer(),
  );
  return detectBpmFromAudioBuffer(audioBuffer);
}
