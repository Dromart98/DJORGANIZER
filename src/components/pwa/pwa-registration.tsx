"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let cancelled = false;

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (!cancelled) await registration.update();
      } catch {
        return;
      }
    }

    function onLoad() {
      void register();
    }

    if (document.readyState === "complete") {
      void register();
    } else {
      window.addEventListener("load", onLoad, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
    };
  }, []);

  return null;
}
