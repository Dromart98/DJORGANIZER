"use client";

export default function LibraryError({ reset }: { reset: () => void }) {
  return (
    <section className="card route-error" role="alert">
      <p className="eyebrow">Biblioteca</p>
      <h1>No se pudo cargar tu música</h1>
      <p>La conexión no está disponible ahora mismo. Vuelve a intentarlo.</p>
      <button className="button button--primary" onClick={reset} type="button">
        Reintentar
      </button>
    </section>
  );
}
