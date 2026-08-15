import Link from "next/link";
import { redirect } from "next/navigation";
import { DesktopExportLink } from "@/components/desktop/desktop-export-link";
import { DeleteCrateForm } from "@/components/organization/delete-organization-forms";
import { SmartCrateForm } from "@/components/organization/smart-crate-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Icon } from "@/components/layout/icon";
import { formatTrackCount, translate } from "@/lib/i18n/functional";
import type { Locale } from "@/lib/i18n/i18n";
import {
  parseSmartCrateRules,
  resolveAllSmartCrateTrackIds,
  resolveSmartCrateTracks,
} from "@/lib/organization/smart-crates";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/tracks";
import type { Tables } from "@/types/database";

const PAGE_SIZE = 100;

type Props = {
  allCrates: Array<Pick<Tables<"crates">, "id" | "name" | "parent_id">>;
  crate: Tables<"crates">;
  locale: Locale;
  requestedPage: number;
  search: string;
  userId: string;
};

function summary(locale: Locale, track: Tables<"tracks">) {
  const duration =
    track.duration_seconds === null
      ? translate(locale, "Duración —")
      : formatDuration(Math.round(track.duration_seconds));
  return `${track.bpm ? `${track.bpm} BPM` : "BPM —"} · ${
    track.musical_key ?? `${translate(locale, "Tonalidad")} —`
  } · ${duration}`;
}

export async function SmartCrateDetail({
  allCrates,
  crate,
  locale,
  requestedPage,
  search,
  userId,
}: Props) {
  const parsedRules = parseSmartCrateRules(crate.smart_rules);
  if (!parsedRules.success) {
    throw new Error("Las reglas guardadas de este crate inteligente no son válidas.");
  }
  const supabase = await createClient();
  const offset = (requestedPage - 1) * PAGE_SIZE;
  const [{ data: tags, error: tagsError }, resolved, exportTrackIds] =
    await Promise.all([
      supabase
        .from("tags")
        .select("id, name")
        .eq("user_id", userId)
        .order("name", { ascending: true }),
      resolveSmartCrateTracks(supabase, parsedRules.data, {
        limit: PAGE_SIZE,
        offset,
        search,
      }),
      resolveAllSmartCrateTrackIds(supabase, parsedRules.data),
    ]);
  if (tagsError) throw new Error("No se pudieron cargar las etiquetas.");

  const pageCount = Math.max(1, Math.ceil(resolved.count / PAGE_SIZE));
  if (resolved.count > 0 && requestedPage > pageCount) {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("cratePage", String(pageCount));
    redirect(`/crates/${crate.id}?${params.toString()}`);
  }

  const text =
    locale === "en"
      ? {
          eyebrow: "Smart crate",
          description:
            "This crate updates automatically from its saved rules. No tracks are copied into it.",
          matching: "matching tracks",
          search: "Search these results",
          searchAction: "Search",
          reset: "Clear",
          emptyTitle: "No tracks match these rules",
          emptyDescription:
            "Edit the rules or update your library metadata. Results refresh automatically.",
          previous: "Previous",
          next: "Next",
        }
      : {
          eyebrow: "Crate inteligente",
          description:
            "Este crate se actualiza automáticamente a partir de sus reglas guardadas. No copia pistas dentro del crate.",
          matching: "pistas coincidentes",
          search: "Buscar en estos resultados",
          searchAction: "Buscar",
          reset: "Limpiar",
          emptyTitle: "Ninguna pista cumple estas reglas",
          emptyDescription:
            "Edita las reglas o actualiza los metadatos de tu biblioteca. Los resultados se refrescan automáticamente.",
          previous: "Anterior",
          next: "Siguiente",
        };

  return (
    <>
      <PageHeader
        action={
          <DeleteCrateForm
            crateId={crate.id}
            name={crate.name}
            revision={crate.updated_at}
          />
        }
        description={crate.description || text.description}
        eyebrow={text.eyebrow}
        title={crate.name}
      />

      <section className="organization-layout">
        <div>
          <div className="organization-section-heading">
            <div>
              <p className="eyebrow">Smart crate</p>
              <h2>{formatTrackCount(locale, resolved.count)}</h2>
            </div>
            <span>{text.matching}</span>
            <DesktopExportLink
              request={{
                crateId: crate.id,
                crateName: crate.name,
                trackIds: exportTrackIds,
              }}
            />
          </div>

          <form className="library-toolbar" method="get">
            <label>
              {text.search}
              <input defaultValue={search} maxLength={100} name="q" />
            </label>
            <button className="button button--secondary" type="submit">
              {text.searchAction}
            </button>
            {search ? (
              <Link className="button button--ghost" href={`/crates/${crate.id}`}>
                {text.reset}
              </Link>
            ) : null}
          </form>

          {resolved.tracks.length ? (
            <div className="crate-track-list">
              {resolved.tracks.map((track) => (
                <article className="card crate-track" key={track.id}>
                  <div>
                    <strong>{track.title}</strong>
                    <p>
                      {track.artist || "—"}
                      {track.album ? ` · ${track.album}` : ""}
                    </p>
                    <small>{summary(locale, track)}</small>
                  </div>
                  <Link
                    className="button button--ghost"
                    href={`/library/${track.id}`}
                  >
                    {locale === "en" ? "View" : "Ver"}
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              description={text.emptyDescription}
              icon={<Icon name="crates" />}
              title={text.emptyTitle}
            />
          )}

          {pageCount > 1 ? (
            <nav
              aria-label={
                locale === "en"
                  ? "Smart crate pages"
                  : "Páginas del crate inteligente"
              }
              className="desktop-scan-pagination"
            >
              {requestedPage > 1 ? (
                <Link
                  className="button button--secondary"
                  href={`/crates/${crate.id}?${new URLSearchParams({
                    ...(search ? { q: search } : {}),
                    cratePage: String(requestedPage - 1),
                  }).toString()}`}
                >
                  {text.previous}
                </Link>
              ) : (
                <span />
              )}
              <span>
                {requestedPage.toLocaleString(locale)} / {pageCount.toLocaleString(locale)}
              </span>
              {requestedPage < pageCount ? (
                <Link
                  className="button button--secondary"
                  href={`/crates/${crate.id}?${new URLSearchParams({
                    ...(search ? { q: search } : {}),
                    cratePage: String(requestedPage + 1),
                  }).toString()}`}
                >
                  {text.next}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </div>

        <aside className="organization-sidebar" id="rules">
          <SmartCrateForm
            crateId={crate.id}
            crates={allCrates.map(({ id, name }) => ({ id, name }))}
            initialDescription={crate.description}
            initialName={crate.name}
            initialParentId={crate.parent_id}
            initialRevision={crate.updated_at}
            initialRules={parsedRules.data}
            tags={tags ?? []}
          />
        </aside>
      </section>
    </>
  );
}
