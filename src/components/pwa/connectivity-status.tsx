"use client";

import { useEffect, useState } from "react";

export function ConnectivityStatus() {
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
    <div aria-live="polite" className="connectivity-banner" role="status">
      Sin conexión · Las funciones en la nube están temporalmente pausadas.
    </div>
  );
}
