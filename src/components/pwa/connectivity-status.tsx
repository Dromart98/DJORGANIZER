"use client";

import { useEffect, useState } from "react";
import { useTranslator } from "@/components/i18n/locale-provider";

export function ConnectivityStatus() {
  const { t } = useTranslator();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    function update() {
      setOnline(navigator.onLine);
    }

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online ? null : (
    <div aria-live="polite" className="connectivity-status" role="status">
      {t("Sin conexión · Los cambios compatibles se guardarán en este dispositivo.")}
    </div>
  );
}
