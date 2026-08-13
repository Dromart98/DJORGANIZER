"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  createTrackAction,
  updateTrackAction,
  type TrackActionState,
} from "@/app/library/actions";
import { useTranslator } from "@/components/i18n/locale-provider";
import type { Tables } from "@/types/database";
import { MaestPreview } from "@/components/library/maest-preview";
import {
  applyMaestFormProposal,
  editMaestFormField,
  initialTrackClassification,
  type MaestFormProposal,
} from "@/lib/desktop/maest-preview";
import type { NativeTrackProposal } from "@/lib/desktop/track-analysis";

const INITIAL_TRACK_ACTION_STATE = {
  status: "idle",
} satisfies TrackActionState;

type TrackFormProps = {
  mode: "create" | "update";
  track?: Tables<"tracks">;
};

function FieldError({
  errors,
  name,
}: {
  errors?: Record<string, string[] | undefined>;
  name: string;
}) {
  const message = errors?.[name]?.[0];
  return message ? <span className="field-error">{message}</span> : null;
}

function SaveButton({ mode }: { mode: TrackFormProps["mode"] }) {
  const { pending } = useFormStatus();
  const { t } = useTranslator();
  return (
    <button className="button button--primary" disabled={pending} type="submit">
      {pending
        ? t("Guardando…")
        : mode === "create"
          ? t("Añadir canción")
          : t("Guardar cambios")}
    </button>
  );
}

export function TrackForm({ mode, track }: TrackFormProps) {
  const action = mode === "create" ? createTrackAction : updateTrackAction;
  const [state, formAction] = useActionState(
    action,
    INITIAL_TRACK_ACTION_STATE,
  );
  const { t } = useTranslator();
  const [classification, setClassification] = useState(() =>
    initialTrackClassification(mode, track?.genre, track?.subgenre),
  );
  const [musical, setMusical] = useState(() => ({
    bpm: track?.bpm?.toString() ?? "", musicalKey: track?.musical_key ?? "",
    camelotKey: track?.camelot_key ?? "", energy: track?.energy?.toString() ?? "",
    evidence: {} as Partial<NativeTrackProposal>,
  }));

  useEffect(() => {
    setClassification(
      initialTrackClassification(mode, track?.genre, track?.subgenre),
    );
  }, [mode, track?.id, track?.genre, track?.subgenre]);

  useEffect(() => setMusical({ bpm: track?.bpm?.toString() ?? "", musicalKey: track?.musical_key ?? "",
    camelotKey: track?.camelot_key ?? "", energy: track?.energy?.toString() ?? "", evidence: {} }),
  [track?.id, track?.bpm, track?.musical_key, track?.camelot_key, track?.energy]);

  function applyMaestProposal(proposal: MaestFormProposal) {
    setClassification((current) => applyMaestFormProposal(current, proposal));
  }

  function resetClassification() {
    setClassification(
      initialTrackClassification(mode, track?.genre, track?.subgenre),
    );
    setMusical({ bpm: track?.bpm?.toString() ?? "", musicalKey: track?.musical_key ?? "",
      camelotKey: track?.camelot_key ?? "", energy: track?.energy?.toString() ?? "", evidence: {} });
  }

  function applyNativeProposal(proposal: NativeTrackProposal) {
    setMusical((current) => ({
      bpm: proposal.bpm ? String(proposal.bpm.value) : current.bpm,
      musicalKey: proposal.key?.value ?? current.musicalKey,
      camelotKey: proposal.key?.camelotValue ?? current.camelotKey,
      energy: proposal.energy ? String(proposal.energy.value) : current.energy,
      evidence: {
        ...current.evidence,
        ...(proposal.bpm ? { bpm: proposal.bpm } : {}),
        ...(proposal.key ? { key: proposal.key } : {}),
        ...(proposal.energy ? { energy: proposal.energy } : {}),
      },
    }));
  }

  function editMusicalField(
    field: "bpm" | "energy" | "key",
    values: Partial<Pick<typeof musical, "bpm" | "energy" | "musicalKey" | "camelotKey">>,
  ) {
    setMusical((current) => {
      const evidence = { ...current.evidence };
      delete evidence[field];
      return { ...current, ...values, evidence };
    });
  }

  return (
    <form
      action={formAction}
      className="track-form card"
      data-offline-action={mode === "create" ? "track-create" : "track-update"}
      onReset={resetClassification}
    >
      {track ? <input name="id" type="hidden" value={track.id} /> : null}
      {track ? (
        <input name="revision" type="hidden" value={track.updated_at} />
      ) : null}
      {mode === "update" ? (
        <input
          name="maest_evidence"
          type="hidden"
          value={JSON.stringify(classification.evidence)}
        />
      ) : null}
      {mode === "update" ? <input name="native_analysis_evidence" type="hidden" value={JSON.stringify(musical.evidence)} /> : null}
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}

      {mode === "update" && track ? (
        <MaestPreview
          formGenre={classification.genre}
          formSubgenre={classification.subgenre}
          formValues={{ bpm: musical.bpm, musicalKey: musical.musicalKey, camelotKey: musical.camelotKey, energy: musical.energy }}
          onApply={applyMaestProposal}
          onApplyNative={applyNativeProposal}
          track={track}
        />
      ) : null}

      <div className="form-grid">
        <label className="field field--wide">
          <span>{t("Título *")}</span>
          <input
            autoFocus
            defaultValue={track?.title}
            maxLength={300}
            name="title"
            required
          />
          <FieldError errors={state.fieldErrors} name="title" />
        </label>
        <label className="field">
          <span>{t("Artista")}</span>
          <input
            defaultValue={track?.artist ?? ""}
            maxLength={300}
            name="artist"
          />
          <FieldError errors={state.fieldErrors} name="artist" />
        </label>
        <label className="field">
          <span>{t("Álbum")}</span>
          <input defaultValue={track?.album ?? ""} maxLength={300} name="album" />
          <FieldError errors={state.fieldErrors} name="album" />
        </label>
        <label className="field">
          <span>{t("Género")}</span>
          <input
            maxLength={120}
            name="genre"
            onChange={(event) =>
              setClassification((current) =>
                editMaestFormField(current, "genre", event.target.value),
              )
            }
            value={classification.genre}
          />
          <FieldError errors={state.fieldErrors} name="genre" />
        </label>
        <label className="field">
          <span>{t("Subgénero")}</span>
          <input
            maxLength={120}
            name="subgenre"
            onChange={(event) =>
              setClassification((current) =>
                editMaestFormField(current, "subgenre", event.target.value),
              )
            }
            value={classification.subgenre}
          />
          <FieldError errors={state.fieldErrors} name="subgenre" />
        </label>
        <label className="field">
          <span>BPM</span>
          <input
            value={musical.bpm}
            onChange={(event) => editMusicalField("bpm", { bpm: event.target.value })}
            max={300}
            min={20}
            name="bpm"
            step="0.01"
            type="number"
          />
          <FieldError errors={state.fieldErrors} name="bpm" />
        </label>
        <label className="field">
          <span>{t("Tonalidad")}</span>
          <input
            value={musical.musicalKey}
            onChange={(event) => editMusicalField("key", { musicalKey: event.target.value })}
            maxLength={16}
            name="musical_key"
            placeholder={t("Am, A minor o 8A")}
          />
          <small>{t("Se normaliza y completa Camelot al guardar.")}</small>
          <FieldError errors={state.fieldErrors} name="musical_key" />
        </label>
        <label className="field">
          <span>Camelot</span>
          <input
            value={musical.camelotKey}
            onChange={(event) => editMusicalField("key", { camelotKey: event.target.value })}
            maxLength={3}
            name="camelot_key"
            placeholder="8A"
          />
          <FieldError errors={state.fieldErrors} name="camelot_key" />
        </label>
        <label className="field">
          <span>{t("Duración (segundos)")}</span>
          <input
            defaultValue={track?.duration_seconds ?? ""}
            min={0}
            name="duration_seconds"
            step="0.001"
            type="number"
          />
          <FieldError errors={state.fieldErrors} name="duration_seconds" />
        </label>
        <label className="field">
          <span>{t("Año")}</span>
          <input
            defaultValue={track?.release_year ?? ""}
            max={2100}
            min={1000}
            name="release_year"
            type="number"
          />
          <FieldError errors={state.fieldErrors} name="release_year" />
        </label>
        <label className="field">
          <span>{t("Energía (0–10)")}</span>
          <input
            value={musical.energy}
            onChange={(event) => editMusicalField("energy", { energy: event.target.value })}
            max={10}
            min={0}
            name="energy"
            type="number"
          />
          <FieldError errors={state.fieldErrors} name="energy" />
        </label>
        <label className="field">
          <span>{t("Valoración")}</span>
          <select defaultValue={track?.rating ?? ""} name="rating">
            <option value="">{t("Sin valorar")}</option>
            {[0, 1, 2, 3, 4, 5].map((rating) => (
              <option key={rating} value={rating}>
                {rating}
              </option>
            ))}
          </select>
          <FieldError errors={state.fieldErrors} name="rating" />
        </label>
        <label className="field field--full">
          <span>{t("Comentarios")}</span>
          <textarea
            defaultValue={track?.comments ?? ""}
            maxLength={5000}
            name="comments"
            rows={4}
          />
          <FieldError errors={state.fieldErrors} name="comments" />
        </label>
      </div>

      <div className="form-actions">
        <Link className="button button--secondary" href="/library">
          {t("Cancelar")}
        </Link>
        <SaveButton mode={mode} />
      </div>
    </form>
  );
}
