"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DESKTOP_EXPORT_REQUEST_KEY,
  type DesktopExportRequest,
} from "@/lib/desktop/export-request";

function hasDesktopExport() {
  return Boolean(
    (window as Window & { __TAURI__?: { core?: { invoke?: unknown } } })
      .__TAURI__?.core?.invoke,
  );
}

export function DesktopExportLink({ request }: { request: DesktopExportRequest }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => setAvailable(hasDesktopExport()), []);

  return (
    <div className="organization-inline-actions">
      <Link
        className="button button--secondary button--small"
        href={`/crates/${request.crateId}/sort`}
      >
        Ordenar
      </Link>
      {available ? (
        <Link
          className="button button--secondary button--small"
          href="/import"
          onClick={() =>
            sessionStorage.setItem(
              DESKTOP_EXPORT_REQUEST_KEY,
              JSON.stringify(request),
            )
          }
        >
          Exportar
        </Link>
      ) : (
        <p className="organization-muted" role="status">
          La exportación está disponible al abrir esta biblioteca en la aplicación
          de escritorio.
        </p>
      )}
    </div>
  );
}
