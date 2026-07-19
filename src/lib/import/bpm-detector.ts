import {
  bpmAnalysisWindow,
  bpmSampleWindows,
  summarizeBpmCandidates,
} from "@/lib/import/bpm";

export async function detectBpmFromAudioBuffer(audioBuffer: AudioBuffer) {
  const window = bpmAnalysisWindow(audioBuffer.duration);

  if (!window) {
    throw new Error("El archivo es demasiado corto para analizar su BPM.");
  }

  const { analyze } = await import("web-audio-beat-detector");
  const tempos = await Promise.all(
    bpmSampleWindows(window).map((sample) =>
      analyze(audioBuffer, sample.offset, sample.duration),
    ),
  );
  const result = summarizeBpmCandidates(tempos);

  if (!result) {
    throw new Error("El detector no devolvió un BPM válido.");
  }

  return result;
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
