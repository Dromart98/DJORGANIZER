import { DESKTOP_MAEST_ANALYZER, isDesktopMaestCompatibilityKey } from "@/lib/desktop/maest-analysis";
import {
  analyzeScannedTrack,
  beginMaestAnalysis,
  invokeMaestCancel,
  invokeMaestRelease,
  isMaestCancellation,
  maestErrorMessage,
  prepareMaestModel,
  sameMaestLink,
  startMaestProgressPolling,
  type MaestAnalysisProgress,
  type MaestLinkIdentity,
  type MaestPublicResult,
  type MaestRequestIdentity,
} from "@/lib/desktop/maest-preview";
import type { TauriCore } from "@/lib/desktop/tauri";

export const MAX_MAEST_BATCH_TRACKS = 25;

export function maestBatchActionVisible(desktopAvailable: boolean) {
  return desktopAvailable;
}

export function maestBatchActionDisabled(selectionSize: number, busy: boolean, preparationSettling = false) {
  return selectionSize === 0 || busy || preparationSettling;
}

export type MaestBatchTrack = {
  trackId: string;
  title: string;
  artist: string | null;
  evidence: {
    genre: MaestBatchFieldEvidence;
    subgenre: MaestBatchFieldEvidence;
  };
};

export type MaestBatchFieldEvidence = {
  value: string | null;
  source: string | null;
  analyzerId: string | null;
  analyzerVersion: string | null;
  compatibilityKey: string | null;
  analyzedAt: number | null;
  rawScore: number | null;
};

export type MaestBatchItemStatus = "pending" | "preparing" | "analyzing" | "completed" | "failed" | "cancelled" | "skipped" | "already_analyzed";
export type MaestBatchItem = MaestBatchTrack & { status: MaestBatchItemStatus; result?: MaestPublicResult; error?: string };
export type MaestBatchPhase = "idle" | "preparing-model" | "running" | "completed" | "cancelled" | "blocked";
export type MaestBatchState = {
  batchId: string;
  phase: MaestBatchPhase;
  currentIndex: number | null;
  eligibleTotal: number;
  currentEligibleOrdinal: number | null;
  currentTrackId: string | null;
  currentOperationId: string | null;
  progress: MaestAnalysisProgress | null;
  cancelRequested: boolean;
  error: string | null;
  items: MaestBatchItem[];
};

export type MaestBatchLink = { sessionId: string; scanId: string };
type BatchOptions = {
  core: TauriCore;
  tracks: MaestBatchTrack[];
  getTrackLink(trackId: string): MaestBatchLink | null;
  includeAnalyzed: boolean;
  locale: "es" | "en";
  onState(state: MaestBatchState): void;
  onPreparationSettlingChange?(settling: boolean): void;
};

function validFieldEvidence(field: MaestBatchFieldEvidence) {
  return Boolean(
    field.value?.trim() && field.source === "automatic" &&
    field.analyzerId === DESKTOP_MAEST_ANALYZER.id &&
    field.analyzerVersion === DESKTOP_MAEST_ANALYZER.version &&
    isDesktopMaestCompatibilityKey(field.compatibilityKey) &&
    typeof field.analyzedAt === "number" && Number.isSafeInteger(field.analyzedAt) && field.analyzedAt >= 0 &&
    typeof field.rawScore === "number" && Number.isFinite(field.rawScore),
  );
}

export function hasValidMaestClassification(track: MaestBatchTrack) {
  return validFieldEvidence(track.evidence.genre) && validFieldEvidence(track.evidence.subgenre);
}

export function isAnalyzerBusy(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "analyzer_busy");
}

export class MaestBatchOrchestrator {
  private state: MaestBatchState;
  private stopped = false;
  private active: { request: MaestRequestIdentity; stage: "armed" | "running" } | null = null;
  private preparationSettling = false;
  private initialLinks = new Map<string, MaestBatchLink>();

  constructor(private options: BatchOptions) {
    if (options.tracks.length > MAX_MAEST_BATCH_TRACKS) throw new Error("maest_batch_limit");
    const items = options.tracks.map((track) => {
      const link = options.getTrackLink(track.trackId);
      if (link) this.initialLinks.set(track.trackId, link);
      return {
        ...track,
        status: !link ? "skipped" as const : !options.includeAnalyzed && hasValidMaestClassification(track) ? "already_analyzed" as const : "pending" as const,
        ...(!link ? { error: options.locale === "en" ? "Local file not linked." : "Archivo local no vinculado." } : {}),
      };
    });
    this.state = { batchId: crypto.randomUUID(), phase: "idle", currentIndex: null, eligibleTotal: items.filter((item) => item.status === "pending").length, currentEligibleOrdinal: null, currentTrackId: null, currentOperationId: null, progress: null, cancelRequested: false, error: null, items };
    this.emit();
  }

  snapshot() { return this.state; }
  private emit() { if (!this.stopped) this.options.onState(this.state); }
  private update(patch: Partial<MaestBatchState>) { this.state = { ...this.state, ...patch }; this.emit(); }
  private updateItem(index: number, patch: Partial<MaestBatchItem>) {
    const items = this.state.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
    this.update({ items });
  }
  private cancelPending() {
    this.state = { ...this.state, items: this.state.items.map((item) => item.status === "pending" ? { ...item, status: "cancelled" } : item) };
  }

  async run() {
    const eligible = this.state.items.some((item) => item.status === "pending");
    if (!eligible) { this.update({ phase: "completed" }); return; }
    this.update({ phase: "preparing-model" });
    this.setPreparationSettling(true);
    try { await prepareMaestModel(this.options.core); }
    catch (error) {
      if (!this.stopped && !this.state.cancelRequested) this.update({ phase: "blocked", error: maestErrorMessage(error, this.options.locale) });
      return;
    } finally {
      this.setPreparationSettling(false);
    }
    if (this.stopped || this.state.cancelRequested) return;

    let eligibleOrdinal = 0;
    for (let index = 0; index < this.state.items.length; index += 1) {
      if (this.stopped || this.state.cancelRequested) break;
      const item = this.state.items[index];
      if (item.status !== "pending") continue;
      const originalLink = this.initialLinks.get(item.trackId) ?? null;
      const currentLink = this.options.getTrackLink(item.trackId);
      const expected: MaestLinkIdentity | null = originalLink ? { ...originalLink, trackId: item.trackId } : null;
      const current: MaestLinkIdentity | null = currentLink ? { ...currentLink, trackId: item.trackId } : null;
      if (!sameMaestLink(expected, current) || !currentLink) {
        this.state = { ...this.state, eligibleTotal: this.state.eligibleTotal - 1 };
        this.updateItem(index, { status: "skipped", error: this.options.locale === "en" ? "Local file link changed." : "Cambió el vínculo del archivo local." });
        continue;
      }
      eligibleOrdinal += 1;
      const request: MaestRequestIdentity = { ...currentLink, trackId: item.trackId, requestId: index + 1, operationId: crypto.randomUUID() };
      this.update({ phase: "running", currentIndex: index, currentEligibleOrdinal: eligibleOrdinal, currentTrackId: item.trackId, currentOperationId: request.operationId, progress: null });
      this.updateItem(index, { status: "preparing" });
      let stopPolling = () => {};
      try {
        await beginMaestAnalysis(this.options.core, request);
        this.active = { request, stage: "armed" };
        if (this.stopped || this.state.cancelRequested) { await invokeMaestRelease(this.options.core, request); this.active = null; break; }
        this.active.stage = "running";
        this.updateItem(index, { status: "analyzing" });
        stopPolling = startMaestProgressPolling(this.options.core, request, (progress) => this.update({ progress }));
        const result = await analyzeScannedTrack(this.options.core, request);
        if (!this.stopped && !this.state.cancelRequested) this.updateItem(index, { status: "completed", result });
      } catch (error) {
        if (this.stopped) return;
        if (this.state.cancelRequested || isMaestCancellation(error)) this.updateItem(index, { status: "cancelled" });
        else {
          this.updateItem(index, { status: "failed", error: maestErrorMessage(error, this.options.locale) });
          if (isAnalyzerBusy(error)) { this.cancelPending(); this.update({ phase: "blocked", error: maestErrorMessage(error, this.options.locale) }); return; }
        }
      } finally {
        stopPolling();
        this.active = null;
      }
    }
    if (this.stopped) return;
    if (this.state.cancelRequested) this.finishCancelled();
    else this.update({ phase: "completed", currentIndex: null, currentEligibleOrdinal: null, currentTrackId: null, currentOperationId: null, progress: null });
  }

  async cancel() {
    if (this.state.cancelRequested || ["completed", "cancelled", "blocked"].includes(this.state.phase)) return;
    if (this.state.phase === "preparing-model") {
      this.cancelPending();
      this.update({ phase: "cancelled", cancelRequested: true, currentIndex: null, currentEligibleOrdinal: null, currentTrackId: null, currentOperationId: null, progress: null });
      return;
    }
    this.update({ cancelRequested: true });
    const active = this.active;
    if (!active) return;
    try {
      if (active.stage === "running") await invokeMaestCancel(this.options.core, active.request);
      else await invokeMaestRelease(this.options.core, active.request);
    } catch { /* The active analysis promise owns its terminal state. */ }
  }

  dispose() {
    if (this.state.phase === "preparing-model") {
      this.cancelPending();
      this.state = { ...this.state, phase: "cancelled", cancelRequested: true, currentIndex: null, currentEligibleOrdinal: null, currentTrackId: null, currentOperationId: null, progress: null };
    }
    this.stopped = true;
    const active = this.active;
    if (!active) return;
    if (active.stage === "running") void invokeMaestCancel(this.options.core, active.request);
    else void invokeMaestRelease(this.options.core, active.request);
  }

  private finishCancelled() {
    this.cancelPending();
    this.update({ phase: "cancelled", currentIndex: null, currentEligibleOrdinal: null, currentTrackId: null, currentOperationId: null, progress: null });
  }

  private setPreparationSettling(settling: boolean) {
    if (this.preparationSettling === settling) return;
    this.preparationSettling = settling;
    this.options.onPreparationSettlingChange?.(settling);
  }
}
