"use client";

export default function LibraryError({ reset }: { reset: () => void }) {
  return (
    <section className="card route-error" role="alert">
      <p className="eyebrow">Biblioteca</p>
      <h1>No se pudo completar la operación</h1>
      <p>
        Tu biblioteca no se ha podido actualizar. Vuelve a intentarlo; si el
        problema continúa, regresa a Biblioteca.
      </p>
      <button className="button button--primary" onClick={reset} type="button">
        Reintentar
      </button>
    </section>
  );
}
