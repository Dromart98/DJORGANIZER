"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createSmartCrateAction,
  previewSmartCrateAction,
  updateSmartCrateAction,
} from "@/app/crates/actions";
import { useTranslator } from "@/components/i18n/locale-provider";
import {
  SMART_CRATE_MAX_CONDITIONS,
  SMART_CRATE_MAX_GROUPS,
  smartCrateRulesSchema,
  type SmartCrateField,
  type SmartCrateLogic,
  type SmartCrateOperator,
  type SmartCrateRules,
  type SmartCrateTrackStatus,
} from "@/lib/organization/smart-crates";

type TagOption = { id: string; name: string };
type CrateOption = { id: string; name: string };
type UiCondition = SmartCrateRules["groups"][number]["conditions"][number] & {
  id: string;
};
type UiGroup = { id: string; logic: SmartCrateLogic; conditions: UiCondition[] };

type Props = {
  crateId?: string;
  crates: CrateOption[];
  initialDescription?: string | null;
  initialName?: string;
  initialParentId?: string | null;
  initialRevision?: string;
  initialRules?: SmartCrateRules;
  tags: TagOption[];
};

const fields: SmartCrateField[] = [
  "genre",
  "subgenre",
  "bpm-range",
  "bpm",
  "key",
  "camelot",
  "energy",
  "rating",
  "year",
  "tag",
  "artist",
  "album",
  "title",
];

function id() {
  return crypto.randomUUID();
}

function defaultCondition(): UiCondition {
  return { id: id(), field: "genre", operator: "equals", value: "" };
}

function toUiGroups(rules?: SmartCrateRules): UiGroup[] {
  return (rules?.groups ?? [{ logic: "and" as const, conditions: [{ field: "genre" as const, operator: "equals" as const, value: "" }] }]).map(
    (group) => ({
      id: id(),
      logic: group.logic,
      conditions: group.conditions.map((condition) => ({ ...condition, id: id() })),
    }),
  );
}

function fieldLabel(field: SmartCrateField, locale: string) {
  const es: Record<SmartCrateField, string> = {
    title: "Título",
    artist: "Artista",
    album: "Álbum",
    genre: "Género",
    subgenre: "Subgénero",
    bpm: "BPM",
    "bpm-range": "Rango de BPM",
    key: "Tonalidad",
    camelot: "Camelot",
    energy: "Energía",
    rating: "Valoración",
    year: "Año",
    tag: "Etiqueta",
  };
  const en: Record<SmartCrateField, string> = {
    title: "Title",
    artist: "Artist",
    album: "Album",
    genre: "Genre",
    subgenre: "Subgenre",
    bpm: "BPM",
    "bpm-range": "BPM range",
    key: "Key",
    camelot: "Camelot",
    energy: "Energy",
    rating: "Rating",
    year: "Year",
    tag: "Tag",
  };
  return locale === "en" ? en[field] : es[field];
}

function operatorsFor(field: SmartCrateField): SmartCrateOperator[] {
  if (field === "tag") return ["has"];
  if (["title", "artist", "album", "genre", "subgenre"].includes(field)) {
    return ["equals", "contains"];
  }
  if (["key", "camelot"].includes(field)) return ["equals"];
  if (field === "bpm-range") return ["between"];
  return ["eq", "gte", "lte", "between"];
}

function operatorLabel(operator: SmartCrateOperator, locale: string) {
  const labels = locale === "en"
    ? { equals: "is", contains: "contains", eq: "equals", gte: "at least", lte: "at most", between: "between", has: "has" }
    : { equals: "es", contains: "contiene", eq: "igual a", gte: "como mínimo", lte: "como máximo", between: "entre", has: "tiene" };
  return labels[operator];
}

function isNumeric(field: SmartCrateField) {
  return ["bpm", "bpm-range", "energy", "rating", "year"].includes(field);
}

export function SmartCrateForm({
  crateId,
  crates,
  initialDescription = "",
  initialName = "",
  initialParentId = null,
  initialRevision,
  initialRules,
  tags,
}: Props) {
  const { locale } = useTranslator();
  const [trackStatus, setTrackStatus] = useState<SmartCrateTrackStatus>(
    initialRules?.trackStatus ?? "active",
  );
  const [logic, setLogic] = useState<SmartCrateLogic>(initialRules?.logic ?? "and");
  const [groups, setGroups] = useState<UiGroup[]>(() => toUiGroups(initialRules));
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewSmartCrateAction>> | null>(null);
  const [pending, startTransition] = useTransition();

  const rules = useMemo<SmartCrateRules>(() => ({
    trackStatus,
    version: 1,
    logic,
    groups: groups.map((group) => ({
      logic: group.logic,
      conditions: group.conditions.map(({ id: _id, ...condition }) => condition),
    })),
  }), [groups, logic, trackStatus]);
  const validation = smartCrateRulesSchema.safeParse(rules);
  const totalConditions = groups.reduce((total, group) => total + group.conditions.length, 0);
  const text = locale === "en" ? {
    heading: crateId ? "Edit smart crate" : "Create smart crate",
    helper: "Rules are evaluated against your current library whenever the crate is opened.",
    name: "Name",
    description: "Description",
    parent: "Save inside",
    none: "None",
    trackStatus: "Tracks",
    activeTracks: "Active only",
    archivedTracks: "Archived only",
    allTracks: "Active and archived",
    groups: "Combine groups",
    all: "All must match (AND)",
    any: "Any may match (OR)",
    group: "Group",
    conditions: "Conditions",
    addCondition: "Add condition",
    addGroup: "Add group",
    remove: "Remove",
    preview: "Preview results",
    save: crateId ? "Save smart crate" : "Create smart crate",
    secondValue: "and",
    invalid: "Complete the rule values before previewing or saving.",
    matches: "matching tracks",
  } : {
    heading: crateId ? "Editar crate inteligente" : "Crear crate inteligente",
    helper: "Las reglas se evalúan contra tu biblioteca actual cada vez que abres el crate.",
    name: "Nombre",
    description: "Descripción",
    parent: "Guardar dentro de",
    none: "Ninguna",
    trackStatus: "Pistas",
    activeTracks: "Solo activas",
    archivedTracks: "Solo archivadas",
    allTracks: "Activas y archivadas",
    groups: "Combinar grupos",
    all: "Deben cumplirse todos (Y)",
    any: "Puede cumplirse cualquiera (O)",
    group: "Grupo",
    conditions: "Condiciones",
    addCondition: "Añadir condición",
    addGroup: "Añadir grupo",
    remove: "Quitar",
    preview: "Previsualizar resultados",
    save: crateId ? "Guardar crate inteligente" : "Crear crate inteligente",
    secondValue: "y",
    invalid: "Completa los valores de las reglas antes de previsualizar o guardar.",
    matches: "pistas coincidentes",
  };

  function changeCondition(groupId: string, conditionId: string, patch: Partial<UiCondition>) {
    setPreview(null);
    setGroups((current) => current.map((group) => group.id === groupId
      ? { ...group, conditions: group.conditions.map((condition) => {
          if (condition.id !== conditionId) return condition;
          const next = { ...condition, ...patch };
          if (patch.field) {
            const operators = operatorsFor(patch.field);
            next.operator = operators[0];
            next.value = patch.field === "tag" ? tags[0]?.id ?? "" : isNumeric(patch.field) ? 0 : "";
            delete next.value2;
            if (next.operator === "between") next.value2 = isNumeric(patch.field) ? 0 : "";
          }
          if (patch.operator && patch.operator !== "between") delete next.value2;
          if (patch.operator === "between" && next.value2 === undefined) next.value2 = 0;
          return next;
        }) }
      : group));
  }

  return (
    <form
      action={crateId ? updateSmartCrateAction : createSmartCrateAction}
      className="card organization-form"
      data-offline-action="smart-crate-save"
    >
      <div>
        <p className="eyebrow">Smart crate</p>
        <h2>{text.heading}</h2>
        <p className="organization-muted">{text.helper}</p>
      </div>
      {crateId ? <input name="id" type="hidden" value={crateId} /> : null}
      {initialRevision ? <input name="revision" type="hidden" value={initialRevision} /> : null}
      <input name="smartRules" type="hidden" value={JSON.stringify(rules)} />
      <label className="field">
        {text.name}
        <input defaultValue={initialName} maxLength={120} name="name" required />
      </label>
      <label className="field">
        {text.description}
        <textarea defaultValue={initialDescription ?? ""} maxLength={1000} name="description" rows={2} />
      </label>
      <label className="field">
        {text.parent}
        <select defaultValue={initialParentId ?? ""} name="parentId">
          <option value="">{text.none}</option>
          {crates.filter((crate) => crate.id !== crateId).map((crate) => (
            <option key={crate.id} value={crate.id}>{crate.name}</option>
          ))}
        </select>
      </label>
      <label className="field">
        {text.trackStatus}
        <select
          value={trackStatus}
          onChange={(event) => {
            setTrackStatus(event.target.value as SmartCrateTrackStatus);
            setPreview(null);
          }}
        >
          <option value="active">{text.activeTracks}</option>
          <option value="archived">{text.archivedTracks}</option>
          <option value="all">{text.allTracks}</option>
        </select>
      </label>
      <label className="field">
        {text.groups}
        <select value={logic} onChange={(event) => { setLogic(event.target.value as SmartCrateLogic); setPreview(null); }}>
          <option value="and">{text.all}</option>
          <option value="or">{text.any}</option>
        </select>
      </label>

      {groups.map((group, groupIndex) => (
        <fieldset className="smart-crate-group" key={group.id}>
          <legend>{text.group} {groupIndex + 1}</legend>
          <label className="field">
            {text.conditions}
            <select
              value={group.logic}
              onChange={(event) => {
                setGroups((current) => current.map((item) => item.id === group.id ? { ...item, logic: event.target.value as SmartCrateLogic } : item));
                setPreview(null);
              }}
            >
              <option value="and">{text.all}</option>
              <option value="or">{text.any}</option>
            </select>
          </label>
          {group.conditions.map((condition) => (
            <div className="smart-crate-condition" key={condition.id}>
              <select
                aria-label={locale === "en" ? "Field" : "Campo"}
                value={condition.field}
                onChange={(event) => changeCondition(group.id, condition.id, { field: event.target.value as SmartCrateField })}
              >
                {fields.map((field) => <option key={field} value={field}>{fieldLabel(field, locale)}</option>)}
              </select>
              <select
                aria-label={locale === "en" ? "Operator" : "Operador"}
                value={condition.operator}
                onChange={(event) => changeCondition(group.id, condition.id, { operator: event.target.value as SmartCrateOperator })}
              >
                {operatorsFor(condition.field).map((operator) => <option key={operator} value={operator}>{operatorLabel(operator, locale)}</option>)}
              </select>
              {condition.field === "tag" ? (
                <select
                  aria-label={locale === "en" ? "Tag" : "Etiqueta"}
                  value={String(condition.value)}
                  onChange={(event) => changeCondition(group.id, condition.id, { value: event.target.value })}
                >
                  <option value="">—</option>
                  {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                </select>
              ) : (
                <input
                  aria-label={locale === "en" ? "Value" : "Valor"}
                  maxLength={120}
                  step={condition.field === "bpm" || condition.field === "bpm-range" ? "0.1" : "1"}
                  type={isNumeric(condition.field) ? "number" : "text"}
                  value={condition.value}
                  onChange={(event) => changeCondition(group.id, condition.id, { value: isNumeric(condition.field) ? Number(event.target.value) : event.target.value })}
                />
              )}
              {condition.operator === "between" ? (
                <>
                  <span>{text.secondValue}</span>
                  <input
                    aria-label={locale === "en" ? "Upper value" : "Valor superior"}
                    step={condition.field === "bpm" || condition.field === "bpm-range" ? "0.1" : "1"}
                    type="number"
                    value={typeof condition.value2 === "number" ? condition.value2 : 0}
                    onChange={(event) => changeCondition(group.id, condition.id, { value2: Number(event.target.value) })}
                  />
                </>
              ) : null}
              <button
                disabled={group.conditions.length === 1}
                onClick={() => { setGroups((current) => current.map((item) => item.id === group.id ? { ...item, conditions: item.conditions.filter((entry) => entry.id !== condition.id) } : item)); setPreview(null); }}
                type="button"
              >
                {text.remove}
              </button>
            </div>
          ))}
          <div className="organization-inline-actions">
            <button
              disabled={totalConditions >= SMART_CRATE_MAX_CONDITIONS}
              onClick={() => { setGroups((current) => current.map((item) => item.id === group.id ? { ...item, conditions: [...item.conditions, defaultCondition()] } : item)); setPreview(null); }}
              type="button"
            >
              {text.addCondition}
            </button>
            {groups.length > 1 ? (
              <button onClick={() => { setGroups((current) => current.filter((item) => item.id !== group.id)); setPreview(null); }} type="button">{text.remove} {text.group.toLocaleLowerCase()}</button>
            ) : null}
          </div>
        </fieldset>
      ))}

      <button
        disabled={groups.length >= SMART_CRATE_MAX_GROUPS || totalConditions >= SMART_CRATE_MAX_CONDITIONS}
        onClick={() => { setGroups((current) => [...current, { id: id(), logic: "and", conditions: [defaultCondition()] }]); setPreview(null); }}
        type="button"
      >
        {text.addGroup}
      </button>

      {!validation.success ? <p className="form-message form-message--error">{text.invalid}</p> : null}
      <button
        className="button button--secondary"
        disabled={!validation.success || pending}
        onClick={() => startTransition(async () => setPreview(await previewSmartCrateAction(JSON.stringify(rules))))}
        type="button"
      >
        {text.preview}
      </button>
      {preview ? (
        <div className="smart-crate-preview" role="status">
          <strong>{preview.count.toLocaleString(locale)} {text.matches}</strong>
          {preview.tracks.length ? (
            <ul>
              {preview.tracks.map((track) => (
                <li key={track.id}>{track.title}{track.artist ? ` · ${track.artist}` : ""}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <button className="button button--primary" disabled={!validation.success} type="submit">{text.save}</button>
    </form>
  );
}
