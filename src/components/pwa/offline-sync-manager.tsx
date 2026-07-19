"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recordDiagnosticEvent } from "@/lib/diagnostics/local-diagnostics";
import {
  formDataToOfflinePayload,
  loadOfflineMutations,
  offlineEntityForAction,
  saveOfflineMutations,
  type OfflineAction,
  type OfflineMutation,
} from "@/lib/offline/mutation-queue";

const QUEUE_EVENT = "djorganizer:offline-queue-changed";

type SyncResult = {
  conflict?: { reason: string } | null;
  error?: string;
  id: string;
  status: "applied" | "conflict" | "failed";
};

function actionFromSubmit(event: SubmitEvent) {
  const form = event.target instanceof HTMLFormElement ? event.target : null;
  const submitter =
    event.submitter instanceof HTMLElement ? event.submitter : null;
  const action =
    submitter?.dataset.offlineAction ?? form?.dataset.offlineAction;
  return { action: action as OfflineAction | undefined, form, submitter };
}

export function OfflineSyncManager() {
  const router = useRouter();
  const [queue, setQueue] = useState<OfflineMutation[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refreshQueue = useCallback(() => {
    setQueue(loadOfflineMutations(window.localStorage));
  }, []);

  const synchronize = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return;
    const current = loadOfflineMutations(window.localStorage);
    const pending = current.filter(
      (mutation) => mutation.action && mutation.status !== "conflict",
    );
    if (!pending.length) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const response = await fetch("/api/sync/mutations", {
        body: JSON.stringify({ mutations: pending.slice(0, 100) }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("sync-unavailable");
      const body = (await response.json()) as { results?: SyncResult[] };
      const results = new Map(
        (body.results ?? []).map((result) => [result.id, result]),
      );
      let applied = 0;
      const next = current.flatMap((mutation) => {
        const result = results.get(mutation.id);
        if (!result) return [mutation];
        if (result.status === "applied") {
          applied += 1;
          return [];
        }
        return [
          {
            ...mutation,
            attempts: (mutation.attempts ?? 0) + 1,
            lastError:
              result.status === "conflict"
                ? "La versión remota cambió."
                : result.error ?? "No se pudo sincronizar.",
            status: result.status,
          } satisfies OfflineMutation,
        ];
      });
      saveOfflineMutations(window.localStorage, next);
      setQueue(next);
      const failed = next.filter(
        (mutation) =>
          results.has(mutation.id) &&
          (mutation.status === "failed" || mutation.status === "conflict"),
      ).length;
      if (failed) {
        recordDiagnosticEvent(window.localStorage, {
          category: "sync",
          createdAt: new Date().toISOString(),
          message: `${failed} mutaciones pendientes requieren reintento o revisión.`,
        });
      }
      if (applied) {
        setNotice(`${applied} cambios offline sincronizados.`);
        router.refresh();
      }
    } catch {
      recordDiagnosticEvent(window.localStorage, {
        category: "sync",
        createdAt: new Date().toISOString(),
        message: "El endpoint de sincronización no estaba disponible.",
      });
      setNotice("La sincronización sigue pendiente; se reintentará más tarde.");
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [router]);

  useEffect(() => {
    refreshQueue();
    const handleQueueChange = () => refreshQueue();
    const handleOnline = () => {
      refreshQueue();
      void synchronize();
    };
    const handleSubmit = (event: Event) => {
      if (!(event instanceof SubmitEvent) || navigator.onLine) return;
      const { action, form, submitter } = actionFromSubmit(event);
      if (!action || !form) return;
      if (!form.reportValidity()) return;
      const confirmation = form.dataset.offlineConfirm;
      if (confirmation && !window.confirm(confirmation)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const formData = submitter
        ? new FormData(form, submitter as HTMLButtonElement)
        : new FormData(form);
      const payload = formDataToOfflinePayload(formData);
      const fallbackId = crypto.randomUUID();
      const identity = offlineEntityForAction(action, payload, fallbackId);
      const mutation: OfflineMutation = {
        action,
        attempts: 0,
        createdAt: new Date().toISOString(),
        ...identity,
        id: crypto.randomUUID(),
        payload,
        revision:
          typeof payload.revision === "string" ? payload.revision : null,
        status: "pending",
      };
      const current = loadOfflineMutations(window.localStorage);
      saveOfflineMutations(window.localStorage, [...current, mutation]);
      refreshQueue();
      setNotice("Cambio guardado en este dispositivo hasta recuperar la conexión.");
      if (action.endsWith("create")) form.reset();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener(QUEUE_EVENT, handleQueueChange);
    window.addEventListener("submit", handleSubmit, true);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(QUEUE_EVENT, handleQueueChange);
      window.removeEventListener("submit", handleSubmit, true);
    };
  }, [refreshQueue, synchronize]);

  useEffect(() => {
    if (navigator.onLine) void synchronize();
  }, [synchronize]);

  const managed = queue.filter((mutation) => mutation.action);
  const conflicts = managed.filter((mutation) => mutation.status === "conflict");
  if (!managed.length && !notice) return null;

  function resolveConflicts(force: boolean) {
    const next = loadOfflineMutations(window.localStorage).flatMap((mutation) => {
      if (mutation.status !== "conflict") return [mutation];
      return force
        ? [{ ...mutation, revision: null, status: "pending" as const }]
        : [];
    });
    saveOfflineMutations(window.localStorage, next);
    setQueue(next);
    setNotice(
      force
        ? "Los conflictos se reintentarán usando la versión local."
        : "Los cambios locales en conflicto se descartaron.",
    );
    if (force) void synchronize();
  }

  return (
    <aside
      aria-live="polite"
      className="offline-sync-panel"
      aria-label="Sincronización offline"
    >
      <strong>Sincronización</strong>
      {notice ? <span>{notice}</span> : null}
      {managed.length ? (
        <span>
          {managed.length} pendientes
          {conflicts.length ? ` · ${conflicts.length} conflictos` : ""}
        </span>
      ) : null}
      <div>
        {managed.length ? (
          <button
            className="button button--secondary button--small"
            disabled={syncing || !managed.some((item) => item.status !== "conflict")}
            onClick={() => void synchronize()}
            type="button"
          >
            {syncing ? "Sincronizando…" : "Reintentar"}
          </button>
        ) : null}
        {conflicts.length ? (
          <>
            <button
              className="button button--secondary button--small"
              onClick={() => resolveConflicts(true)}
              type="button"
            >
              Usar cambios locales
            </button>
            <button
              className="button button--danger button--small"
              onClick={() => resolveConflicts(false)}
              type="button"
            >
              Descartar conflictos
            </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}
