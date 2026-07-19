"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createTrackAction,
  updateTrackAction,
  type TrackActionState,
} from "@/app/library/actions";
import type { Tables } from "@/types/database";

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
  return (
    <button className="button button--primary" disabled={pending} type="submit">
      {pending
        ? "Guardando…"
        : mode === "create"
          ? "Añadir canción"
          : "Guardar cambios"}
    </button>
  );
}

export function TrackForm({ mode, track }: TrackFormProps) {
  const action = mode === "create" ? createTrackAction : updateTrackAction;
  const [state, formAction] = useActionState(
    action,
    INITIAL_TRACK_ACTION_STATE,
  );

  return (
    <form
      action={formAction}
      className="track-form card"
      data-offline-action={mode === "create" ? "track-create" : "track-update"}
    >
      {track ? <input name="id" type="hidden" value={track.id} /> : null}
      {track ? (
        <input name="revision" type="hidden" value={track.updated_at} />
      ) : null}
      {state.status === "error" ? (
        <p className="form-message form-message--error" role="alert">
          {state.message}
        </p>
      ) : null}

      <div className="form-grid">
        <label className="field field--wide">
          <span>Título *</span>
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
          <span>Artista</span>
          <input
            defaultValue={track?.artist ?? ""}
            maxLength={300}
            name="artist"
          />
          <FieldError errors={state.fieldErrors} name="artist" />
        </label>
        <label className="field">
          <span>Álbum</span>
          <input defaultValue={track?.album ?? ""} maxLength={300} name="album" />
          <FieldError errors={state.fieldErrors} name="album" />
        </label>
        <label className="field">
          <span>Género</span>
          <input defaultValue={track?.genre ?? ""} maxLength={120} name="genre" />
          <FieldError errors={state.fieldErrors} name="genre" />
        </label>
        <label className="field">
          <span>BPM</span>
          <input
            defaultValue={track?.bpm ?? ""}
            max={300}
            min={20}
            name="bpm"
            step="0.01"
            type="number"
          />
          <FieldError errors={state.fieldErrors} name="bpm" />
        </label>
        <label className="field">
          <span>Tonalidad</span>
          <input
            defaultValue={track?.musical_key ?? ""}
            maxLength={16}
            name="musical_key"
            placeholder="Am, A minor o 8A"
          />
          <small>Se normaliza y completa Camelot al guardar.</small>
          <FieldError errors={state.fieldErrors} name="musical_key" />
        </label>
        <label className="field">
          <span>Camelot</span>
          <input
            defaultValue={track?.camelot_key ?? ""}
            maxLength={3}
            name="camelot_key"
            placeholder="8A"
          />
          <FieldError errors={state.fieldErrors} name="camelot_key" />
        </label>
        <label className="field">
          <span>Duración (segundos)</span>
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
          <span>Año</span>
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
          <span>Energía (0–100)</span>
          <input
            defaultValue={track?.energy ?? ""}
            max={100}
            min={0}
            name="energy"
            type="number"
          />
          <FieldError errors={state.fieldErrors} name="energy" />
        </label>
        <label className="field">
          <span>Valoración</span>
          <select defaultValue={track?.rating ?? ""} name="rating">
            <option value="">Sin valorar</option>
            {[0, 1, 2, 3, 4, 5].map((rating) => (
              <option key={rating} value={rating}>
                {rating}
              </option>
            ))}
          </select>
          <FieldError errors={state.fieldErrors} name="rating" />
        </label>
        <label className="field field--full">
          <span>Comentarios</span>
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
          Cancelar
        </Link>
        <SaveButton mode={mode} />
      </div>
    </form>
  );
}
