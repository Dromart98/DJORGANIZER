"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { recordDiagnosticEvent } from "@/lib/diagnostics/local-diagnostics";
import { getMessages } from "@/lib/i18n/i18n";

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  section?: "general" | "library";
};

function safeTechnicalDetail(error: RouteErrorProps["error"], section: string) {
  const errorType = /^[A-Za-z][\w.-]{0,79}$/.test(error.name)
    ? error.name
    : "Error";
  const digest =
    error.digest && /^[A-Za-z0-9_-]{1,128}$/.test(error.digest)
      ? error.digest
      : "unavailable";
  return `Captured route failure; section=${section}; type=${errorType}; digest=${digest}.`;
}

export function RouteError({
  error,
  reset,
  section = "general",
}: RouteErrorProps) {
  const locale = useLocale();
  const copy = getMessages(locale).routeError;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const recordedRef = useRef(false);

  useEffect(() => {
    headingRef.current?.focus();
    if (recordedRef.current) return;
    recordedRef.current = true;
    try {
      recordDiagnosticEvent(window.localStorage, {
        category: "runtime",
        createdAt: new Date().toISOString(),
        message: safeTechnicalDetail(error, section),
      });
    } catch {
      // Local diagnostics must never prevent recovery.
    }
  }, [error, section]);

  return (
    <section
      aria-labelledby="route-error-title"
      className="card route-error"
      role="alert"
    >
      <p className="eyebrow">
        {section === "library" ? copy.libraryEyebrow : copy.eyebrow}
      </p>
      <h1 id="route-error-title" ref={headingRef} tabIndex={-1}>
        {copy.title}
      </h1>
      <p>
        {section === "library"
          ? copy.libraryDescription
          : copy.description}
      </p>
      <div className="route-error__actions">
        <button className="button button--primary" onClick={reset} type="button">
          {copy.retry}
        </button>
        <Link className="button button--secondary" href="/">
          {copy.dashboard}
        </Link>
        <Link className="button button--secondary" href="/library">
          {copy.library}
        </Link>
        {section === "general" ? (
          <Link className="button button--secondary" href="/import">
            {copy.import}
          </Link>
        ) : null}
      </div>
      <small>{copy.diagnostics}</small>
    </section>
  );
}
